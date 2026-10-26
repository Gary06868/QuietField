export function normalizeFocus(value){
 const v=value&&typeof value==='object'?value:{};
 const minutes=(n,max,fallback)=>Number.isInteger(n)&&n>=1&&n<=max?n:fallback;
 return {focusMinutes:minutes(v.focusMinutes,180,25),restMinutes:minutes(v.restMinutes,60,5)};
}
// One wall-clock deadline; pausing freezes remaining time. No audio autoplay.
export class FocusTimer{
 constructor({onChange=()=>{},canRun=()=>true}={}){this.onChange=onChange;this.canRun=canRun;this.config=normalizeFocus({});this.status='idle';this.phase='focus';this.cycle=0;this.remaining=0;}
 snapshot(){return {status:this.status,phase:this.phase,cycle:this.cycle,remainingMs:this.status==='running'?Math.max(0,this.deadline-Date.now()):this.remaining,deadline:this.deadline||0};}
 emit(){this.onChange(this.snapshot());}
 arm(){clearTimeout(this.timer);if(this.status==='running')this.timer=setTimeout(()=>this.reconcile(),Math.max(0,this.deadline-Date.now()));}
 start(config){this.dispose();this.config=normalizeFocus(config);this.status='running';this.phase='focus';this.cycle=1;this.deadline=Date.now()+this.config.focusMinutes*60000;this.emit();this.arm();}
 pause(){if(this.status!=='running')return;this.remaining=Math.max(0,this.deadline-Date.now());this.status='paused';clearTimeout(this.timer);this.emit();}
 resume(){if(this.status!=='paused'||!this.canRun())return;this.status='running';this.deadline=Date.now()+this.remaining;this.emit();this.arm();}
 stop(){this.dispose();this.status='idle';this.phase='focus';this.cycle=0;this.remaining=0;this.deadline=0;this.emit();}
 dispose(){clearTimeout(this.timer);}
 reconcile(){
  if(this.status!=='running')return;
  if(!this.canRun()){this.stop();return;}
  const now=Date.now();if(now<this.deadline){this.arm();return;}
  const focus=this.config.focusMinutes*60000,rest=this.config.restMinutes*60000,period=focus+rest,elapsed=now-this.deadline,whole=Math.floor(elapsed/period),part=elapsed%period,start=this.deadline+whole*period;
  if(this.phase==='focus'){
   this.cycle+=whole;if(part<rest){this.phase='rest';this.deadline=start+rest;}else{this.phase='focus';this.cycle++;this.deadline=start+period;}
  }else{
   this.cycle+=whole+1;if(part<focus){this.phase='focus';this.deadline=start+focus;}else{this.phase='rest';this.deadline=start+period;}
  }
  this.emit();this.arm();
 }
}
