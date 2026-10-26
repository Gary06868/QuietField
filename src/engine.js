import {files} from './storage.js';
import {protectionCurve,trackVolume,masterVolume} from './loudness.js';
import {SerialQueue,makeRoom,pcmBytes,PCM_LIMIT,MiB} from './audio-budget.js';
export const MIX_FADE_SECONDS=.8;
export class AudioEngine {
  constructor() {this.tracks=new Map(); this.cache=new Map(); this.pending=new Map(); this.jobs=new Map(); this.serial=0; this.masterValue=.5; this.playing=false; this.sleepAt=0; this.token=0;this.decodeQueue=new SerialQueue();this.memoryBudget=(globalThis.navigator?.deviceMemory<=4?192:384)*MiB;this.mixRequest=0;this.preparing=new Map();this.sourceRefs=new Map();this.transition=null;this.motions=new Map();this.dynamicSoundscape=false;this.tone='natural';this.focusQuiet=false;}
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
    this.sceneFade=this.ctx.createGain();this.sceneFade.gain.value=1;
    this.toneLow=this.ctx.createBiquadFilter();this.toneLow.type='lowshelf';this.toneLow.frequency.value=180;
    this.toneHigh=this.ctx.createBiquadFilter();this.toneHigh.type='highshelf';this.toneHigh.frequency.value=2500;
    this.focusGain=this.ctx.createGain();this.focusGain.gain.value=this.focusQuiet?0:1;
    this.bus.connect(this.sceneFade).connect(this.toneLow).connect(this.toneHigh).connect(this.limiter).connect(this.protection).connect(this.focusGain).connect(this.master).connect(this.analyser).connect(this.ctx.destination);
    this.setTone(this.tone);
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
      makeRoom(this.cache,this.protectedTracks(),pcmBytes(sound.duration||40,this.ctx.sampleRate,sound.channels||2),this.memoryBudget);
      let processed;
      if(sound.generated)processed=await this.process({kind:sound.id,rate:this.ctx.sampleRate});
      else {
        let bytes;
        if(sound.custom) {const record=await files('get',sound.id);if(!record)throw new Error('找不到导入的录音');bytes=await record.blob.arrayBuffer();}
        else {const res=await fetch(sound.path);if(!res.ok)throw new Error('本地音频文件缺失');bytes=await res.arrayBuffer();}
        const decoded=await this.ctx.decodeAudioData(bytes);
        if(decoded.duration>600)throw new Error('请选择 10 分钟以内的录音');
        if(decoded.numberOfChannels>2)throw new Error('请选择单声道或双声道录音');
        makeRoom(this.cache,this.protectedTracks(),decoded.length*decoded.numberOfChannels*4,this.memoryBudget);
        const channels=Array.from({length:Math.min(2,decoded.numberOfChannels)},(_,i)=>decoded.getChannelData(i).slice());
        processed=await this.process({channels,rate:decoded.sampleRate,seconds:sound.crossfade||4,preserveLoudness:!sound.custom&&sound.preserveLoudness===true});
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
    const protectedTracks=this.protectedTracks();
    for(const [id,item] of this.cache)if(total>160*1024*1024&&!protectedTracks.has(id)){total-=item.bytes;this.cache.delete(id);}
  }
  protectedTracks() {return new Map([...this.tracks,...(this.transition?.old.tracks||[]),...this.preparing]);}
  setTone(value){
    this.tone=['natural','soft','deep'].includes(value)?value:'natural';if(!this.toneLow)return;
    const now=this.ctx.currentTime,values=this.tone==='deep'?[2,-8]:this.tone==='soft'?[0,-6]:[0,0];
    [this.toneLow.gain,this.toneHigh.gain].forEach((param,i)=>{param.cancelAndHoldAtTime(now);param.setTargetAtTime(values[i],now,.12);});
  }
  setFocusQuiet(value){this.focusQuiet=value===true;if(this.focusGain){const p=this.focusGain.gain,now=this.ctx.currentTime;p.cancelAndHoldAtTime(now);p.linearRampToValueAtTime(this.focusQuiet?0:1,now+.3);}}
  setDynamic(enabled){
    this.dynamicSoundscape=enabled===true;
    for(const motion of this.motions.values())this.updateMotion(motion);
  }
  updateMotion(motion){
    const now=this.ctx.currentTime;
    if(this.dynamicSoundscape&&!motion.oscillator){
      motion.oscillator=this.ctx.createOscillator();motion.oscillator.type='sine';motion.oscillator.frequency.value=1/(45+Math.random()*45);
      motion.depth=this.ctx.createGain();motion.depth.gain.value=0;
      motion.oscillator.connect(motion.depth).connect(motion.gain.gain);motion.oscillator.start();
    }
    // Native modulation cannot exceed the base volume or fight scene/master fades.
    for(const [param,target] of [[motion.gain.gain,this.dynamicSoundscape?.94:1],[motion.depth?.gain,this.dynamicSoundscape?.06:0]]){
      if(!param)continue;param.cancelAndHoldAtTime(now);param.linearRampToValueAtTime(target,now+1);
    }
  }
  attachTrack(buffer,volume,bus,source=null) {
    const gain=this.ctx.createGain(),fresh=!source;
    if(fresh){source=this.ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.loopStart=0;source.loopEnd=buffer.duration;}
    if(fresh){const motion={gain:this.ctx.createGain()};source.connect(motion.gain);this.motions.set(source,motion);if(this.dynamicSoundscape)this.updateMotion(motion);}
    gain.gain.value=volume;this.motions.get(source).gain.connect(gain);gain.connect(bus);
    this.sourceRefs.set(source,(this.sourceRefs.get(source)||0)+1);
    if(fresh)source.start();
    return {source,gain,volume};
  }
  releaseTrack(slot) {
    if(!slot.source||slot.released)return;
    slot.released=true;clearTimeout(slot.releaseTimer);
    const motion=this.motions.get(slot.source);motion.gain.disconnect(slot.gain);slot.gain.disconnect();
    const refs=(this.sourceRefs.get(slot.source)||1)-1;
    if(refs)this.sourceRefs.set(slot.source,refs);
    else{this.sourceRefs.delete(slot.source);slot.source.stop();slot.source.disconnect();motion.oscillator?.stop();motion.oscillator?.disconnect();motion.depth?.disconnect();motion.gain.disconnect();this.motions.delete(slot.source);}
  }
  cancelMixSwitch() {this.mixRequest++;this.preparing.clear();}
  finishMixTransition(force=false) {
    const transition=this.transition;if(!transition)return;
    clearTimeout(transition.timer);
    // Use audio time: a suspended device must not cut an unfinished audible fade.
    if(!force&&this.ctx.currentTime<transition.end){transition.timer=setTimeout(()=>this.finishMixTransition(),Math.max(20,(transition.end-this.ctx.currentTime)*1000));return;}
    this.sceneFade.gain.cancelScheduledValues(this.ctx.currentTime);this.sceneFade.gain.setValueAtTime(1,this.ctx.currentTime);
    for(const slot of transition.old.tracks.values())this.releaseTrack(slot);
    transition.old.bus.disconnect();transition.old.fade.disconnect();
    this.transition=null;transition.resolve();this.evict();
  }
  async switchMix(entries) {
    if(entries.length>8)throw new Error('最多同时混合 8 种声音，先移除一种再添加');
    const request=++this.mixRequest,wasPlaying=this.playing,current=()=>request===this.mixRequest;
    this.preparing=new Map(entries.map(([sound])=>[sound.id,true]));
    try{
      this.init();if(wasPlaying)await this.play();if(!current())return false;
      const prepared=new Map();
      // Prepare without disturbing the audible scene. A failed load keeps it intact.
      for(const [sound,volume] of entries){
        if(!current())return false;
        const {buffer}=await this.load(sound);prepared.set(sound.id,{buffer,volume:trackVolume(volume)});
      }
      // Coalesce rapid clicks; never accumulate a third scene or unbounded sources.
      while(this.transition&&current())await this.transition.done;
      if(!current())return false;
      if(this.sleepAt&&Date.now()>=this.sleepAt){this.pause();return false;}
      if(!wasPlaying){
        clearTimeout(this.pauseHandle);await this.ctx.resume();
        if(!current()){if(!this.playing)this.ctx.suspend();return false;}
        if(this.sleepAt&&Date.now()>=this.sleepAt){this.pause();return false;}
      }
      const old={tracks:this.tracks,bus:this.bus,fade:this.sceneFade};
      const bus=this.ctx.createGain(),fade=this.ctx.createGain(),tracks=new Map();
      bus.gain.value=.7/Math.sqrt(Math.max(1,prepared.size));fade.gain.value=0;
      bus.connect(fade).connect(this.toneLow||this.limiter);
      try{
        for(const [id,{buffer,volume}] of prepared)tracks.set(id,this.attachTrack(buffer,volume,bus,old.tracks.get(id)?.source));
      }catch(error){for(const slot of tracks.values())this.releaseTrack(slot);bus.disconnect();fade.disconnect();throw error;}
      this.tracks=tracks;this.bus=bus;this.sceneFade=fade;
      const now=this.ctx.currentTime,duration=wasPlaying&&[...old.tracks.values()].some(slot=>slot.source)?MIX_FADE_SECONDS:.2;
      // Complementary linear envelopes avoid doubling shared/correlated audio.
      old.fade.gain.cancelAndHoldAtTime(now);if(!wasPlaying)old.fade.gain.setValueAtTime(0,now);old.fade.gain.linearRampToValueAtTime(0,now+duration);
      fade.gain.setValueAtTime(0,now);fade.gain.linearRampToValueAtTime(1,now+duration);
      if(!wasPlaying){this.playing=true;this.scheduleMaster();window.desktop?.playing(true);}
      let resolve;const done=new Promise(value=>{resolve=value;});
      this.transition={old,end:now+duration,done,resolve,timer:setTimeout(()=>this.finishMixTransition(),duration*1000)};
      return true;
    }finally{if(request===this.mixRequest)this.preparing.clear();this.evict();}
  }
  async add(sound, volume) {
    volume=trackVolume(volume);
    if(this.tracks.has(sound.id)) {this.volume(sound.id,volume);return;}
    const slot={volume};this.tracks.set(sound.id,slot);
    try {
      const {buffer}=await this.load(sound);
      if(this.tracks.get(sound.id)!==slot)return;
      Object.assign(slot,this.attachTrack(buffer,0,this.bus),{volume:slot.volume});
      slot.gain.gain.setTargetAtTime(slot.volume,this.ctx.currentTime,.12);this.balance();
    } catch(error) {if(this.tracks.get(sound.id)===slot)this.tracks.delete(sound.id);throw error;}
  }
  remove(id) {
    const slot=this.tracks.get(id);if(!slot)return;
    this.tracks.delete(id);
    if(slot.source) {
      slot.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.07);
      // A shared source may still feed the outgoing scene during a mix switch.
      slot.releaseTimer=setTimeout(()=>this.releaseTrack(slot),350);
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
  pause() {this.cancelMixSwitch();this.playing=false;this.scheduleMaster();clearTimeout(this.pauseHandle);this.pauseHandle=setTimeout(()=>{if(!this.playing){this.finishMixTransition(true);this.ctx?.suspend();}},250);window.desktop?.playing(false);}
  setSleep(deadline) {this.sleepAt=deadline;this.scheduleMaster();}
}
