import React,{useState} from 'react';
import {Clock} from 'lucide-react';import {useLocale} from './LocaleContext.jsx';
const label=ms=>{const seconds=Math.ceil(Math.max(0,ms)/1000);return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};
export function TimerPanel({sleepAt,now,onSleep,onExtend,focus,config,onConfig,onStart,onToggle,onStop,playing}){
 const {t}=useLocale(),[custom,setCustom]=useState(30);
 return <section className="timer enhanced-timer" aria-label={t('计时与专注')}>
  <h3>{t('睡眠定时')}</h3><label><Clock size={18}/><select aria-label={t('睡眠定时')} value={sleepAt?'active':'0'} onChange={e=>onSleep(Number(e.target.value))}><option value="0">{t('不使用')}</option>{sleepAt&&<option value="active">{t('剩余 {time}',{time:label(sleepAt-now)})}</option>}{[15,30,45,60,90,120].map(n=><option value={n} key={n}>{t('{minutes} 分钟后停止',{minutes:n})}</option>)}</select></label>
  <form className="timer-custom" onSubmit={e=>{e.preventDefault();onSleep(Number(custom));}}><label>{t('自定义分钟')}<input aria-label={t('自定义睡眠分钟')} type="number" min="1" max="720" step="1" required value={custom} onChange={e=>setCustom(e.target.value)}/></label><button className="outline" type="submit">{t('设定')}</button><button className="outline" type="button" disabled={!sleepAt} onClick={onExtend}>{t('延长 10 分钟')}</button></form>
  <p>{sleepAt?t('结束前 15 秒缓缓淡出'):t('让声音陪你慢慢入睡')}{' · '}{t('可设 1–720 分钟')}</p>
  <details className="focus-timer" open={focus.status!=='idle'?true:undefined}><summary>{t('专注 / 休息循环')}</summary><form onSubmit={e=>{e.preventDefault();onStart();}}>
   <div className="focus-durations"><label>{t('专注分钟')}<input aria-label={t('专注分钟')} type="number" min="1" max="180" required value={config.focusMinutes} disabled={focus.status!=='idle'} onChange={e=>onConfig({...config,focusMinutes:Number(e.target.value)})}/></label><label>{t('休息分钟')}<input aria-label={t('休息分钟')} type="number" min="1" max="60" required value={config.restMinutes} disabled={focus.status!=='idle'} onChange={e=>onConfig({...config,restMinutes:Number(e.target.value)})}/></label></div>
   {focus.status==='idle'?<button className="outline" type="submit" disabled={!playing}>{t('开始专注')}</button>:<><p className="focus-status" role="status">{t(focus.phase==='rest'?'休息静音中':'专注中')}{' · '}{label(focus.remainingMs)}{' · '}{t('第 {count} 轮',{count:focus.cycle})}{focus.status==='paused'?' · '+t('已暂停'):''}</p><div className="focus-actions"><button className="outline" type="button" onClick={onToggle}>{t(focus.status==='paused'?'继续循环':'暂停循环')}</button><button className="outline" type="button" onClick={onStop}>{t('结束循环')}</button></div></>}
  </form><p>{t('休息时静音并暂停轮播；手动暂停会暂停循环。睡眠结束优先，重启不自动开始。')}</p></details>
 </section>;
}
