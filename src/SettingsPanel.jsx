import React,{useEffect,useState} from 'react';
import {SlidersHorizontal,Image,Info} from 'lucide-react';
import {useLocale} from './LocaleContext.jsx';
import {BackgroundPicker} from './BackgroundPicker.jsx';
import './settings.css';
import {BackupPanel} from './BackupPanel.jsx';
import {reviewNotes,REVIEW_LABEL} from './review-notes.js';

export function SettingsPanel({backgroundId,animateBackground,onBackground,onAnimate,reducedEffects,onReducedEffects,recordingCount,dynamicSoundscape,onDynamic,tone,onTone,onExport,onImportBackup,initialTab='general'}) {
 const {locale,setLocale,t}=useLocale();
 const [tab,setTab]=useState(initialTab||'general'),[desktopState,setDesktopState]=useState(null),[pending,setPending]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;window.desktop?.companionState?.().then(state=>{if(live)setDesktopState(state);}).catch(()=>{if(live)setError(t('窗口设置暂时不可用，请重新打开设置'));});return()=>{live=false;};},[]);
 async function changeClose(event){
  setPending(true);setError('');
  try{const state=await window.desktop.companionPreferences(event.target.value==='tray');if(!state||state.error)throw Error('save');setDesktopState(state);}
  catch{setError(t('设置保存失败，请检查磁盘可用空间'));}finally{setPending(false);}
 }
 const tabs=[['general','常规',SlidersHorizontal],['background','背景',Image],['backup','备份',SlidersHorizontal],['about','关于与版权',Info]];
 return <div className="settings-panel">
  <div className="settings-tabs" role="tablist" aria-label={t('设置分类')}>
   {tabs.map(([id,label,Icon],index)=><button key={id} id={'settings-tab-'+id} type="button" role="tab" aria-selected={tab===id} aria-controls={'settings-'+id} tabIndex={tab===id?0:-1} onClick={()=>setTab(id)} onKeyDown={event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next][0]);document.getElementById('settings-tab-'+tabs[next][0])?.focus();}}}><Icon size={16}/>{t(label)}</button>)}
  </div>
  <section role="tabpanel" id={'settings-'+tab} aria-labelledby={'settings-tab-'+tab} className="settings-content">
   {tab==='general'&&<>
    <div className="settings-row"><div><h3>{t('界面语言')}</h3><p>{t('立即切换，声音继续播放。')}</p></div><div className="language-switch" role="group" aria-label={t('Language / 语言')}><button lang="zh-CN" aria-pressed={locale==='zh-CN'} onClick={()=>setLocale('zh-CN')}>中文</button><button lang="en" aria-pressed={locale==='en'} onClick={()=>setLocale('en')}>English</button></div></div>
    <label className="settings-row settings-toggle"><div><h3>{t('轻量模式')}</h3><p id="light-mode-hint">{t('暂停动态背景和频谱，减少模糊效果，声音不受影响。')}</p></div><input type="checkbox" aria-label={t('轻量模式')} aria-describedby="light-mode-hint" checked={reducedEffects} onChange={event=>onReducedEffects(event.target.checked)}/><span className="settings-switch" aria-hidden="true"/></label>
    <label className="settings-row settings-toggle"><div><h3>{t('动态声景')}</h3><p id="sound-motion-hint">{t('让各声音缓慢轻微起伏，最高保持在你设定的音量；静音仍为静音。')}</p></div><input type="checkbox" aria-label={t('动态声景')} aria-describedby="sound-motion-hint" checked={dynamicSoundscape} onChange={event=>onDynamic(event.target.checked)}/><span className="settings-switch" aria-hidden="true"/></label>
    <div className="settings-row settings-close"><div><h3>{t('音色')}</h3><p>{t('温和调节高低频，不改动录音文件。')}</p></div><select aria-label={t('音色')} value={tone} onChange={event=>onTone(event.target.value)}><option value="natural">{t('原声')}</option><option value="soft">{t('柔和')}</option><option value="deep">{t('低沉')}</option></select></div>
    {window.desktop&&<div className="settings-row settings-close"><div><h3>{t('点击关闭按钮时')}</h3><p id="close-behavior-hint">{t('收起到托盘后，声音继续播放，任务栏不显示窗口。右键托盘图标可以退出。')}</p></div><select aria-label={t('点击关闭按钮时')} aria-describedby="close-behavior-hint" value={desktopState?.closeToTray===false?'quit':'tray'} disabled={!desktopState||pending} onChange={changeClose}><option value="tray">{t('收起到托盘（默认）')}</option><option value="quit">{t('直接退出程序')}</option></select></div>}
    {desktopState?.trayAvailable===false&&<p className="settings-note">{t('系统托盘暂时不可用，关闭时会改为普通最小化，方便再次打开。')}</p>}
    {error&&<p className="settings-error" role="alert">{error}</p>}
    <p className="settings-note">{t('设置自动保存在本机。')}</p>
   </>}
   {tab==='backup'&&<BackupPanel onExport={onExport} onImport={onImportBackup}/>}
   {tab==='background'&&<BackgroundPicker backgroundId={backgroundId} animateBackground={animateBackground} onSelect={onBackground} onAnimateChange={onAnimate} reducedEffects={reducedEffects} onDisableReducedEffects={()=>onReducedEffects(false)} locale={locale}/>}
   {tab==='about'&&<div className="settings-about">
    <p className="settings-version">{t('静野')} · {__APP_VERSION__}{__REVIEW_BUILD__?' · '+t('本地审核版')+' '+REVIEW_LABEL:''}</p><h3>{t('本版更新')}</h3><ul>{reviewNotes.map(note=><li key={note}>{t(note)}</li>)}</ul>{__REVIEW_BUILD__&&<p>{t('此审核版仅使用独立本地配置，不连接更新服务。')}</p>}
    <p>{t('一间随时可以回来的安静房间。所有声音在本机播放，不需要账户，也不会上传你的录音。')}</p>
    <h3>{t('为什么循环更连贯？')}</h3><p>{t('先清理首尾静音，再将首尾最多 4 秒交叉混合成连续波形，交给音频引擎直接循环。播放、暂停和调节音量也会平滑过渡。每段录音会先做基础响度平衡；100% 是平衡后的标准音量，可以继续推至 300%。')}</p>
    <p className="muted">{t('录音中的雷声、鸟鸣等事件仍会重复。系统主动休眠、合盖休眠或音频设备断开会影响播放；最小化窗口可以继续听。')}</p>
    <h3>{t('音源与授权')}</h3><p>{t('内置 {count} 段录音和 3 种合成噪声。',{count:recordingCount})}{__PUBLIC_LIBRARY__?t('录音采用 CC0、Public Domain 或 CC BY 授权。每段录音的作者与授权可在声音详情及随附清单查看。'):t('个人音源库包含尚未逐段核实授权的 Moodist 音源，请勿将此版本作为公开音源包发布。')}</p>
    <p className="muted">{t('音源清单、真实规格、下载校验和授权文件随应用附带。请按各录音的许可保留署名。')}</p>
    <h3>{t('软件版权')}</h3><p>{t('Quiet Field 开源代码采用 MIT 许可证；音源、字体和其他素材遵循各自的许可，详见随附 LICENSE 与 THIRD_PARTY_NOTICES。')}</p>
    <h3>{t('键盘操作')}</h3><p>{t('空格播放 / 暂停；Tab 切换控件；方向键调节音量。最多同时混合 8 种声音。关闭行为可以在常规设置中更改；右键托盘图标选择退出，会结束程序。')}</p>
   </div>}
  </section>
 </div>;
}
