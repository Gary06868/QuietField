export const MiB=1024*1024;
export const PCM_LIMIT=128*MiB;
export class SerialQueue{
  constructor(){this.tail=Promise.resolve();}
  run(task){const current=this.tail.then(task);this.tail=current.catch(()=>{});return current;}
}
export function pcmBytes(seconds,rate=48000,channels=2){
  if(!Number.isFinite(seconds)||seconds<=0||!Number.isFinite(rate)||rate<=0)throw new Error('无法识别音频时长');
  return Math.ceil(seconds*rate*Math.min(2,Math.max(1,channels))*4);
}
export function makeRoom(cache,active,additional,budget){
  if(!Number.isFinite(additional)||additional>PCM_LIMIT)throw new Error('这段录音解码后过大，请使用较短的录音');
  let total=[...cache.values()].reduce((n,x)=>n+x.bytes,0);
  for(const [id,item] of cache)if(total+additional>budget&&!active.has(id)){cache.delete(id);total-=item.bytes;}
  if(total+additional>budget)throw new Error('当前混音占用较多内存，请先移除一段较长的声音');
}
export function probeAudio(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),audio=new Audio();audio.preload='metadata';
    const finish=(error)=>{clearTimeout(timeout);audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);error?reject(error):resolve(duration);};
    let duration;const timeout=setTimeout(()=>finish(new Error('读取音频信息超时')),12000);
    audio.onloadedmetadata=()=>{duration=audio.duration;audio.onloadedmetadata=null;audio.onerror=null;finish(Number.isFinite(duration)&&duration>=.3&&duration<=300?null:new Error('请选择 0.3 秒至 5 分钟的录音'));};
    audio.onerror=()=>{audio.onerror=null;finish(new Error('无法读取此音频格式'));};audio.src=url;
  });
}
