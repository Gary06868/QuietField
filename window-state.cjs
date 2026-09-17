const fs=require('node:fs');const path=require('node:path');
const {fitWindow,chooseDisplay,applyWindowBounds}=require('./window-geometry.cjs');
function windowState(app,screen){
  const file=path.join(app.getPath('userData'),'window-state.json');let saved={};
  try{const parsed=JSON.parse(fs.readFileSync(file,'utf8'));if(parsed&&typeof parsed==='object')saved=parsed;}catch{}
  const preferred=()=>screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const display=chooseDisplay(saved,screen.getAllDisplays(),preferred());
  const initial=fitWindow(saved,display.workArea);
  return {initial,maximized:saved.maximized===true,attach(win){
    let timer,moving,disposed=false;
    const persist=()=>{if(disposed||win.isDestroyed())return;const b=win.getNormalBounds();try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({...b,maximized:win.isMaximized()}));fs.renameSync(file+'.tmp',file);}catch{}};
    const save=()=>{clearTimeout(timer);timer=setTimeout(persist,250);};
    const adjust=()=>{
      if(disposed||win.isDestroyed())return;
      const b=win.getNormalBounds(),d=chooseDisplay(b,screen.getAllDisplays(),preferred()),fit=fitWindow(b,d.workArea);
      win.setMinimumSize(fit.minWidth,fit.minHeight);
      if(!win.isMaximized()&&!win.isFullScreen()&&!win.isMinimized()){
        const next={x:fit.x,y:fit.y,width:fit.width,height:fit.height};
        if(Object.keys(next).some(k=>Math.abs(next[k]-b[k])>1))applyWindowBounds(win,next);
      }
      save();
    };
    const afterMove=()=>{save();clearTimeout(moving);moving=setTimeout(adjust,350);};
    win.on('move',afterMove);win.on('resize',save);win.on('unmaximize',afterMove);win.on('maximize',save);
    for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,adjust);
    win.on('close',persist);win.on('closed',()=>{disposed=true;clearTimeout(timer);clearTimeout(moving);for(const event of ['display-added','display-removed','display-metrics-changed'])screen.removeListener(event,adjust);});
    return adjust;
  }};
}
module.exports=windowState;
