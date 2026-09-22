import React,{useEffect,useState} from 'react';
import {Play,Pause,Pin,PinOff,Maximize2,Volume2,Minus} from 'lucide-react';
export function MiniPlayer(){
 const [state,setState]=useState({ready:false,master:.5,mixes:[],locale:'zh-CN'});
 useEffect(()=>{let live=true;const off=window.desktop?.onCompanionState(s=>{if(live)setState(s);});window.desktop?.companionState().then(s=>{if(live&&s)setState(s);});return()=>{live=false;off?.();};},[]);
 const en=state.locale==='en',t=(zh,english)=>en?english:zh;
 const command=value=>window.desktop?.companionCommand(value),action=value=>window.desktop?.companionAction(value);
 useEffect(()=>{const key=e=>{if(e.code==='Space'&&!['INPUT','SELECT','BUTTON'].includes(e.target.tagName)){e.preventDefault();command({type:'toggle'});}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 return <section className={`mini-player${state.playing?' is-playing':''}`} aria-label={t('迷你播放器','Mini player')}>
  <header className="mini-header"><div className="mini-drag"><img src="./icon.png" alt=""/><span>{t('静野','Quiet Field')}</span></div><button aria-label={state.pinned?t('取消置顶','Unpin window'):t('窗口置顶','Pin window')} title={state.pinned?t('取消置顶','Unpin window'):t('窗口置顶','Pin window')} aria-pressed={!!state.pinned} onClick={()=>action('pin')}>{state.pinned?<PinOff size={14}/>:<Pin size={14}/>}</button>{state.trayAvailable&&<button aria-label={t('收起到托盘','Hide to tray')} title={t('收起到托盘','Hide to tray')} onClick={()=>action('tray')}><Minus size={16}/></button>}<button aria-label={t('返回完整窗口','Open full player')} title={t('返回完整窗口','Open full player')} onClick={()=>action('main')}><Maximize2 size={14}/></button></header>
  <div className="mini-playing"><button className="mini-play" disabled={!state.ready} aria-label={state.playing?t('暂停全部','Pause all'):t('播放全部','Play all')} onClick={()=>command({type:'toggle'})}>{state.playing?<Pause fill="currentColor" size={21}/>:<Play fill="currentColor" size={21}/>}</button><div><strong>{state.loading?t('正在准备声音…','Preparing sounds…'):state.playing?t('正在播放','Playing'):t('已暂停','Paused')}</strong><p title={state.label}>{state.label||t('选一个声音组合，开始放松','Choose a mix to unwind')}</p></div><div className="mini-wave" aria-hidden="true">{[0,1,2,3,4].map(n=><i key={n} style={{'--n':n}}/>)}</div></div>
  <label className="mini-volume"><Volume2 size={16}/><input type="range" min="0" max="100" aria-label={t('总音量','Master volume')} value={Math.round(state.master*100)} style={{'--value':`${state.master*100}%`}} onChange={e=>command({type:'master',value:Number(e.target.value)/100})}/><span>{Math.round(state.master*100)}%</span></label>
  <select className="mini-mixes" aria-label={t('声音组合','Sound mixes')} value="" disabled={!state.ready} onChange={e=>{if(e.target.value)command({type:'mix',id:e.target.value});}}><option value="" disabled>{t('切换声音组合','Switch sound mix')}</option>{state.mixes.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
  <p className="mini-footnote">{state.sleepLabel||(state.playing?t('本地播放 · 无缝循环','Offline · Seamless loops'):t('留一点安静给自己','A little quiet, just for you'))}</p>
 </section>;
}
