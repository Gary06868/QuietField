import React,{useEffect,useState} from 'react';
import {useLocale} from './LocaleContext.jsx';
import {Minus,Square,Copy,X} from 'lucide-react';

export function WindowChrome(){
  const {t}=useLocale();
  const [maximized,setMaximized]=useState(false);
  useEffect(()=>{
    let active=true;
    window.desktop?.windowState?.().then(state=>{if(active)setMaximized(!!state?.maximized);});
    const unsubscribe=window.desktop?.onWindowState?.(state=>setMaximized(state.maximized));
    return()=>{active=false;unsubscribe?.();};
  },[]);
  return <header className="window-chrome" aria-label={t("窗口控制")}>
    <div className="window-drag" title={t("拖动窗口，双击最大化或还原")}/>
    <div className="window-buttons">
      <button aria-label={t("最小化窗口")} title={t("最小化")} onClick={()=>window.desktop?.windowAction?.('minimize')}><Minus size={15}/></button>
      <button aria-label={maximized?t("还原窗口"):t("最大化窗口")} title={maximized?t("还原"):t("最大化")} onClick={()=>window.desktop?.windowAction?.('maximize')}>{maximized?<Copy size={13}/>:<Square size={13}/>}</button>
      <button className="window-close" aria-label={t("关闭窗口")} title={t("关闭")} onClick={()=>window.desktop?.windowAction?.('close')}><X size={17}/></button>
    </div>
  </header>;
}
