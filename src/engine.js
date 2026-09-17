import {files} from './storage.js';
import {protectionCurve,trackVolume,masterVolume} from './loudness.js';
import {SerialQueue,makeRoom,pcmBytes,PCM_LIMIT,MiB} from './audio-budget.js';
export class AudioEngine {
  constructor() {this.tracks=new Map(); this.cache=new Map(); this.pending=new Map(); this.jobs=new Map(); this.serial=0; this.masterValue=.5; this.playing=false; this.sleepAt=0; this.token=0;this.decodeQueue=new SerialQueue();this.memoryBudget=(globalThis.navigator?.deviceMemory<=4?192:384)*MiB;}
  init() {
    if (this.ctx) return;
    try{this.ctx=new AudioContext({latencyHint:'playback',sampleRate:48000});}catch(error){if(error.name!=='NotSupportedError')throw error;this.ctx=new AudioContext({latencyHint:'playback'});}
    this.bus=this.ctx.createGain(); this.bus.gain.value=.7;
    this.limiter=this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value=-5; this.limiter.knee.value=6; this.limiter.ratio.value=12;
    this.limiter.attack.value=.003; this.limiter.release.value=.25;
    this.master=this.ctx.createGain(); this.master.gain.value=0;
    this.protection=this.ctx.createWaveShaper();this.protection.curve=protectionCurve();
    this.protection.oversample='none';
    this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=512;this.analyser.smoothingTimeConstant=.8;
    this.bus.connect(this.limiter).connect(this.protection).connect(this.master).connect(this.analyser).connect(this.ctx.destination);
    this.worker=new Worker(new URL('./audio-worker.js',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{
      const job=this.jobs.get(data.id); this.jobs.delete(data.id);
      if(job) data.error?job.reject(new Error(data.error)):job.resolve(data.result);
    };
    this.worker.onerror=()=>{for(const job of this.jobs.values())job.reject(new Error('音频处理失败，请重新打开应用'));this.jobs.clear();};
  }
  process(data) {
    this.init();
    return new Promise((resolve,reject)=>{
      const id=++this.serial; this.jobs.set(id,{resolve,reject});
      this.worker.postMessage({id,...data},data.channels?.map(c=>c.buffer)||[]);
    });
  }
  async load(sound) {
    this.init();
    if(this.cache.has(sound.id)) {const hit=this.cache.get(sound.id);this.cache.delete(sound.id);this.cache.set(sound.id,hit);return hit;}
    if(this.pending.has(sound.id))return this.pending.get(sound.id);
    const promise=this.decodeQueue.run(async()=>{
      makeRoom(this.cache,this.tracks,pcmBytes(sound.duration||40,this.ctx.sampleRate,sound.channels||2),this.memoryBudget);
      let processed;
      if(sound.generated)processed=await this.process({kind:sound.id,rate:this.ctx.sampleRate});
      else {
        let bytes;
        if(sound.custom) {const record=await files('get',sound.id);if(!record)throw new Error('找不到导入的录音');bytes=await record.blob.arrayBuffer();}
        else {const res=await fetch(sound.path);if(!res.ok)throw new Error('本地音频文件缺失');bytes=await res.arrayBuffer();}
        const decoded=await this.ctx.decodeAudioData(bytes);
        if(decoded.duration>600)throw new Error('请选择 10 分钟以内的录音');
        if(decoded.numberOfChannels>2)throw new Error('请选择单声道或双声道录音');
        makeRoom(this.cache,this.tracks,decoded.length*decoded.numberOfChannels*4,this.memoryBudget);
        const channels=Array.from({length:Math.min(2,decoded.numberOfChannels)},(_,i)=>decoded.getChannelData(i).slice());
        processed=await this.process({channels,rate:decoded.sampleRate,seconds:sound.crossfade||4});
      }
      const buffer=this.ctx.createBuffer(processed.channels.length,processed.channels[0].length,processed.rate);
      processed.channels.forEach((c,i)=>buffer.copyToChannel(c,i));
      const result={buffer,details:{...processed,channels:buffer.numberOfChannels},bytes:buffer.length*buffer.numberOfChannels*4};
      this.cache.set(sound.id,result);this.evict();return result;
    });
    this.pending.set(sound.id,promise);
    try{return await promise;}finally{this.pending.delete(sound.id);}
  }
  async inspectImport(file){
    this.init();return this.decodeQueue.run(async()=>{
      const decoded=await this.ctx.decodeAudioData(await file.arrayBuffer());
      if(decoded.duration>300||decoded.duration<.3||decoded.numberOfChannels>2||decoded.length*decoded.numberOfChannels*4>PCM_LIMIT)throw new Error('请选择 5 分钟以内的单声道或双声道录音');
      return {duration:decoded.duration,sampleRate:decoded.sampleRate,numberOfChannels:decoded.numberOfChannels};
    });
  }
  async recover(){
    if(!this.playing||!this.ctx)return;
    if(this.sleepAt&&Date.now()>=this.sleepAt){this.pause();return;}
    await this.ctx.resume();this.scheduleMaster();
  }
  evict() {
    let total=[...this.cache.values()].reduce((n,x)=>n+x.bytes,0);
    for(const [id,item] of this.cache)if(total>160*1024*1024&&!this.tracks.has(id)){total-=item.bytes;this.cache.delete(id);}
  }
  async add(sound, volume) {
    volume=trackVolume(volume);
    if(this.tracks.has(sound.id)) {this.volume(sound.id,volume);return;}
    const slot={volume};this.tracks.set(sound.id,slot);
    try {
      const {buffer}=await this.load(sound);
      if(this.tracks.get(sound.id)!==slot)return;
      const source=this.ctx.createBufferSource(), gain=this.ctx.createGain();
      source.buffer=buffer;source.loop=true;source.loopStart=0;source.loopEnd=buffer.duration;
      source.connect(gain).connect(this.bus);gain.gain.value=0;
      slot.source=source;slot.gain=gain;source.start();
      gain.gain.setTargetAtTime(slot.volume,this.ctx.currentTime,.12);this.balance();
    } catch(error) {if(this.tracks.get(sound.id)===slot)this.tracks.delete(sound.id);throw error;}
  }
  remove(id) {
    const slot=this.tracks.get(id);if(!slot)return;
    this.tracks.delete(id);
    if(slot.source) {
      slot.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.07);
      slot.source.stop(this.ctx.currentTime+.35);
      slot.source.onended=()=>{slot.source.disconnect();slot.gain.disconnect();};
    }
    this.balance();this.evict();
  }
  balance() {if(this.ctx)this.bus.gain.setTargetAtTime(.7/Math.sqrt(Math.max(1,this.tracks.size)),this.ctx.currentTime,.25);}
  volume(id,value) {value=trackVolume(value);const slot=this.tracks.get(id);if(slot){slot.volume=value;slot.gain?.gain.setTargetAtTime(value,this.ctx.currentTime,.06);}}
  setMaster(value) {this.masterValue=masterVolume(value);if(this.ctx)this.scheduleMaster();}
  scheduleMaster() {
    if(!this.ctx)return;
    const now=this.ctx.currentTime,p=this.master.gain;
    p.cancelAndHoldAtTime(now);
    if(!this.playing){p.linearRampToValueAtTime(0,now+.2);return;}
    const remaining=this.sleepAt?(this.sleepAt-Date.now())/1000:Infinity;
    const value=this.masterValue*Math.min(1,Math.max(0,remaining/15));
    p.linearRampToValueAtTime(value,now+.2);
    if(Number.isFinite(remaining)) {
      if(remaining>15)p.setValueAtTime(this.masterValue,now+remaining-15);
      p.linearRampToValueAtTime(0,now+Math.max(.21,remaining));
    }
  }
  async play() {this.init();clearTimeout(this.pauseHandle);this.playing=true;await this.ctx.resume();this.scheduleMaster();window.desktop?.playing(this.playing);}
  pause() {this.playing=false;this.scheduleMaster();clearTimeout(this.pauseHandle);this.pauseHandle=setTimeout(()=>{if(!this.playing)this.ctx?.suspend();},250);window.desktop?.playing(false);}
  setSleep(deadline) {this.sleepAt=deadline;this.scheduleMaster();}
}
