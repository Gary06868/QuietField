import {useLocale} from './LocaleContext.jsx';
import React,{useEffect,useRef} from 'react';

export function Visualizer({engine,playing,disabled=false,mode='ring'}) {
  const {t,locale}=useLocale();const ref=useRef();
  useEffect(()=>{
    if(disabled)return;
    const canvas=ref.current,ctx=canvas.getContext('2d');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,last=0,disposed=false;
    const data=new Uint8Array(256);
    const draw=time=>{
      if(disposed)return;
      frame=requestAnimationFrame(draw);
      if(document.hidden||time-last<33)return;last=time;
      const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
      const w=box.width,h=box.height;if(!w||!h)return;
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      data.fill(0);
      if(playing&&!reduced.matches)engine.analyser?.getByteFrequencyData(data);
      if(mode==='ring'){
        const x=w/2,y=h/2,r=Math.min(w,h)*.32;
        for(const scale of [1,.9,1.32]){ctx.beginPath();ctx.arc(x,y,r*scale,0,Math.PI*2);ctx.strokeStyle=scale===1?'#36acffa0':'#36acff28';ctx.lineWidth=scale===1?1:.6;ctx.stroke();}
        for(let i=0;i<128;i++){
          const a=i/128*Math.PI*2-Math.PI/2;
          const level=data[Math.floor(i/128*120)]/255;
          const extent=2+level*level*r*.55;
          ctx.strokeStyle=`rgba(52,174,255,${.35+level*.65})`;ctx.lineWidth=1.2;
          ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);ctx.lineTo(x+Math.cos(a)*(r+extent),y+Math.sin(a)*(r+extent));ctx.stroke();
          const rr=r*1.2+(i%7)*2;ctx.fillStyle=`rgba(67,177,255,${.18+level*.55})`;ctx.fillRect(x+Math.cos(a)*rr,y+Math.sin(a)*rr,1.2,1.2);
        }
        ctx.textAlign='center';ctx.fillStyle=playing?'#b7dcff':'#8ba3bc';ctx.font='11px "Quiet Sans", sans-serif';ctx.fillText(t(playing?'随声音呼吸':'静候，下一刻'),x,y+4);
      }else{
        const bars=40,step=w/bars;
        for(let i=0;i<bars;i++){
          const level=data[Math.floor(Math.pow(i/bars,1.8)*180)]/255;
          const bar=2+level*level*(h-5);
          ctx.fillStyle=`rgba(63,178,255,${.25+level*.75})`;ctx.fillRect(i*step,h-bar,Math.max(1,step*.3),bar);
        }
      }
    };
    frame=requestAnimationFrame(draw);
    return()=>{disposed=true;cancelAnimationFrame(frame);};
  },[engine,playing,mode,disabled,locale]);
  return <canvas ref={ref} className={`visualizer ${mode}`} aria-hidden="true"/>;
}
