export const ROTATION_INTERVALS=[1,5,10,15,30];
export function normalizeRotation(value,saved=[]){
  const v=value&&typeof value==='object'?value:{};
  const selected=new Set(Array.isArray(v.ids)?v.ids:[]);
  const ids=saved.filter(p=>selected.has(p.id)&&Object.values(p.mix||{}).some(n=>Number.isFinite(n)&&n>0)).map(p=>p.id);
  return {ids:[...new Set(ids)],intervalMinutes:ROTATION_INTERVALS.includes(v.intervalMinutes)?v.intervalMinutes:5,mode:v.mode==='random'?'random':'sequence'};
}

// One timeout, armed only while playback is eligible. No UI polling or catch-up burst.
export class MixRotation{
  constructor({apply,canRun,cancelApply=()=>{},onError=()=>{},onStop=()=>{},random=Math.random}){
    Object.assign(this,{apply,canRun,cancelApply,onError,onStop,random});this.epoch=0;this.enabled=false;this.ids=[];this.currentId=null;
  }
  invalidate(){
    this.epoch++;clearTimeout(this.timer);this.timer=null;
    if(this.pending!==null&&this.pending!==undefined){this.pending=null;this.cancelApply();}
  }
  configure(options,eligibleIds){
    this.invalidate();const selected=new Set(options.ids);
    this.ids=[...new Set(eligibleIds.filter(id=>selected.has(id)))];
    this.intervalMinutes=ROTATION_INTERVALS.includes(options.intervalMinutes)?options.intervalMinutes:5;
    this.mode=options.mode==='random'?'random':'sequence';this.enabled=options.enabled===true&&this.ids.length>=2;
    if(options.enabled&&!this.enabled)this.onStop();this.arm();
  }
  noteCurrent(id){this.currentId=id;}
  playbackChanged(){this.invalidate();this.arm();}
  stop(){this.enabled=false;this.invalidate();}
  dispose(){this.stop();}
  arm(){
    if(!this.enabled||this.ids.length<2||!this.canRun())return;
    this.timer=setTimeout(()=>this.advance(),this.intervalMinutes*60000);
  }
  async advance(){
    this.timer=null;if(!this.enabled||!this.canRun())return;
    const epoch=this.epoch,candidates=this.ids.filter(id=>id!==this.currentId);
    const index=this.ids.indexOf(this.currentId);
    const id=this.mode==='random'?candidates[Math.min(candidates.length-1,Math.floor(this.random()*candidates.length))]:this.ids[(index+1)%this.ids.length];
    this.pending=epoch;
    try{
      const committed=await this.apply(id);
      if(epoch!==this.epoch)return;
      this.pending=null;
      if(committed){this.currentId=id;this.arm();}
      else{this.stop();this.onStop();}
    }catch(error){
      if(epoch!==this.epoch)return;
      this.pending=null;this.stop();this.onStop();this.onError(error);
    }
  }
}
