import React,{useId} from 'react';
import {useLocale} from './LocaleContext.jsx';
import {ROTATION_INTERVALS} from './listening-options.js';

export function RotationPanel({saved,eligibleIds,options,enabled,playing,onEnabled,onOptions}){
  const {t}=useLocale(),hint=useId();
  const selected=options.ids.filter(id=>eligibleIds.includes(id));
  return <section className="rotation-panel" aria-label={t('组合自动轮播')}>
    <label className="rotation-heading"><span>{t('组合自动轮播')}</span><input type="checkbox" aria-label={t('组合自动轮播')} aria-describedby={hint} checked={enabled} disabled={selected.length<2} onChange={e=>onEnabled(e.target.checked)}/></label>
    <p id={hint}>{selected.length<2?t('选择至少两套有声音的收藏组合。'):enabled?(playing?t('正在轮播；手动切组合或增删声音会关闭轮播。'):t('轮播已就绪，点击播放后开始计时。')):t('播放时按间隔平滑切换；重启后需重新开启。')}</p>
    <div className="rotation-options"><label>{t('切换间隔')}<select aria-label={t('切换间隔')} value={options.intervalMinutes} onChange={e=>onOptions({...options,intervalMinutes:Number(e.target.value)})}>{ROTATION_INTERVALS.map(n=><option value={n} key={n}>{t('每 {minutes} 分钟',{minutes:n})}</option>)}</select></label><label>{t('轮播顺序')}<select aria-label={t('轮播顺序')} value={options.mode} onChange={e=>onOptions({...options,mode:e.target.value})}><option value="sequence">{t('按列表顺序')}</option><option value="random">{t('随机（不连续重复）')}</option></select></label></div>
    {saved.length>0&&<fieldset className="rotation-mixes"><legend>{t('参与轮播的收藏组合')}</legend>{saved.map(p=><label key={p.id}><input type="checkbox" aria-label={t('轮播 {name}',{name:p.name})} checked={selected.includes(p.id)} disabled={!eligibleIds.includes(p.id)} onChange={e=>onOptions({...options,ids:e.target.checked?[...options.ids,p.id]:options.ids.filter(id=>id!==p.id)})}/><span>{p.name}</span>{!eligibleIds.includes(p.id)&&<small>{t('暂无可播放声音')}</small>}</label>)}</fieldset>}
  </section>;
}
