const finite=n=>typeof n==='number'&&Number.isFinite(n);
function fitWindow(saved,work){
  const gap=work.width>480&&work.height>360?12:0;
  const available={x:work.x+gap,y:work.y+gap,width:Math.max(1,work.width-gap*2),height:Math.max(1,work.height-gap*2)};
  const minWidth=Math.min(760,available.width),minHeight=Math.min(600,available.height);
  const width=Math.round(Math.min(available.width,Math.max(minWidth,finite(saved?.width)?saved.width:Math.min(1440,available.width*.92))));
  const height=Math.round(Math.min(available.height,Math.max(minHeight,finite(saved?.height)?saved.height:Math.min(960,available.height*.94))));
  const x=Math.round(Math.max(available.x,Math.min(available.x+available.width-width,finite(saved?.x)?saved.x:available.x+(available.width-width)/2)));
  const y=Math.round(Math.max(available.y,Math.min(available.y+available.height-height,finite(saved?.y)?saved.y:available.y+(available.height-height)/2)));
  return {x,y,width,height,minWidth,minHeight};
}
function chooseDisplay(saved,displays,fallback){
  if(!saved||![saved.x,saved.y,saved.width,saved.height].every(finite))return fallback;
  let best=fallback,area=0;
  for(const d of displays){const w=d.workArea,a=Math.max(0,Math.min(saved.x+saved.width,w.x+w.width)-Math.max(saved.x,w.x))*Math.max(0,Math.min(saved.y+saved.height,w.y+w.height)-Math.max(saved.y,w.y));if(a>area){area=a;best=d;}}
  return best;
}
function applyWindowBounds(win,desired){
  let request={...desired};
  // Fractional DPI may ceil an outer dimension by one DIP. Feed the
  // measured native offset back once so saving/restoring cannot accumulate it.
  for(let attempt=0;attempt<3;attempt++){
    win.setBounds(request);const actual=win.getBounds();
    if(['x','y','width','height'].every(k=>actual[k]===desired[k]))break;
    const next={...request};for(const k of ['x','y','width','height'])next[k]+=desired[k]-actual[k];
    if(next.width<=0||next.height<=0)break;request=next;
  }
}
module.exports={fitWindow,chooseDisplay,applyWindowBounds};
