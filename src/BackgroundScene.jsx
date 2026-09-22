import React,{useEffect,useState} from 'react';
import {getBackground} from './backgrounds.js';

export function BackgroundScene({backgroundId='alpine',animateBackground=true,reducedEffects=false}) {
  const background = getBackground(backgroundId);
  const [visible,setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);

  useEffect(() => {
    const onVisibilityChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange',onVisibilityChange);
    return () => document.removeEventListener('visibilitychange',onVisibilityChange);
  },[]);

  const animate = Boolean(background.animated && animateBackground && !reducedEffects && visible);
  const style = background.image ? {backgroundImage:`url("${background.image}")`} : {backgroundColor:background.color};

  return <div className={`qf-background qf-background--${background.id}`} data-background={background.id} data-animate={animate} aria-hidden="true">
    <div className="qf-background-art" style={style}/>
    {background.id === 'aurora' && <><div className="qf-aurora qf-aurora--one"/><div className="qf-aurora qf-aurora--two"/></>}
    {background.id === 'starlight' && <><div className="qf-stars qf-stars--near"/><div className="qf-stars qf-stars--far"/><div className="qf-star-haze"/></>}
    {background.kind !== 'solid' && <div className="qf-background-shade"/>}
  </div>;
}