import React,{useEffect,useRef,useState,useId} from 'react';
import {createRoot} from 'react-dom/client';
import {AudioLines,Heart,LayoutGrid,Leaf,CloudRain,Bird,House,Car,Building2,Coffee,Search,FolderOpen,Play,Pause,Volume2,X,Save,Trash2,Clock,Repeat2,Wind,Waves,Flame,Trees,CloudLightning,Headphones,Info,Check,Plus,Music2,TrainFront,Keyboard,LoaderCircle,Download,Settings,PictureInPicture2} from 'lucide-react';
import catalog from '#catalog';
import {AudioEngine} from './engine.js';
import {FocusTimer} from './focus-timer.js';
import {TimerPanel} from './TimerPanel.jsx';
import {exportBackup,commitBackup} from './backup.js';
import {MAX_SAVED_MIXES,MAX_FAVORITES} from './settings.js';
import {MixRotation} from './listening-options.js';
import {RotationPanel} from './RotationPanel.jsx';
import {files,readSettings} from './storage.js';
import {trackVolume,masterVolume} from './loudness.js';
import {Visualizer} from './Visualizer.jsx';
import {WindowChrome} from './WindowChrome.jsx';
import {ErrorBoundary} from './ErrorBoundary.jsx';
import {probeAudio} from './audio-budget.js';
import './style.css';
import './premium.css';
import './alpine.css';
import './locales.css';
import './backgrounds.css';
import './companion.css';
import './responsive.css';
import {MiniPlayer} from './MiniPlayer.jsx';
import {UpdateCenter} from './UpdateCenter.jsx';
import {BackgroundScene} from './BackgroundScene.jsx';
import {SettingsPanel} from './SettingsPanel.jsx';
import {validateBackground} from './backgrounds.js';
import {LocaleProvider,useLocale} from './LocaleContext.jsx';
import {matchesSound,translate} from './i18n.js';

const miniMode=location.hash==='#mini';
if(miniMode)document.body.classList.add('mini-window');
const engine=miniMode?null:new AudioEngine();
const categoryIcons={'自然':Leaf,'雨声':CloudRain,'动物':Bird,'城市':Building2,'场所':House,'交通':Car,'物品':Coffee,'噪音':AudioLines,'导入':Music2};
const specialIcons={'light-rain':CloudRain,'wind-in-trees':Trees,'waves':Waves,'campfire':Flame,'river':Waves,'thunder':CloudLightning,'cafe':Coffee,'wind':Wind,'howling-wind':Wind,'inside-a-train':TrainFront,'keyboard':Keyboard,'bsb-0229':Keyboard,'bsb-2838':Keyboard,'bsb-2816':Clock,'bsb-3598':Wind,'bsb-0078':Wind,'bsb-0904':Trees,'bsb-0987':Flame,'bsb-2857':Flame,'bsb-2727':TrainFront,'bsb-3040':TrainFront,'bsb-0635':TrainFront,'bsb-1447':Waves,'bsb-3222':Waves,'bsb-0507':Waves,'bsb-2687':Music2};
const presets=__PUBLIC_LIBRARY__?[{name:'深林细雨',mix:{'blanket-rain':.55,'blanket-wind':.35,'blanket-birds':.15}},{name:'海边放空',mix:{'blanket-waves':.65,'blanket-wind':.2}},{name:'深夜专注',mix:{'brown-noise':.55,'wav-rain-house':.25}}]:[{name:'深林细雨',mix:{'light-rain':.55,'wind-in-trees':.35,birds:.15}},{name:'海边放空',mix:{waves:.65,wind:.2}},{name:'深夜专注',mix:{'brown-noise':.55,'rain-on-window':.25}}];
const initial=readSettings();
const clamp=masterVolume;
function Icon({sound,...props}) {const Component=specialIcons[sound.id]||categoryIcons[sound.category]||Music2;return <Component {...props}/>;}
function Slider({label,value,onChange,max=300}) {const {t}=useLocale();return <input aria-label={label} aria-valuetext={`${Math.round(value*100)}%`} title={max===300?t('100% 为平衡后标准音量，最高可增强至 300%'):label} type="range" min="0" max={max} value={Math.round(value*100)} style={{'--value':`${value*100/max*100}%`}} onChange={e=>onChange(Number(e.target.value)/100)}/>;}
function Modal({title,onClose,children,className}) {
  const {t}=useLocale();const ref=useRef(),titleId=useId();
  useEffect(()=>{const previous=document.activeElement;ref.current.showModal();return()=>{ref.current?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
  return <dialog ref={ref} className={className} aria-labelledby={titleId} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><header><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label={t("关闭弹窗")} onClick={onClose}><X/></button></header>{children}</dialog>;
}

function App() {
  const {locale,nameOf}=useLocale();const localeRef=useRef(locale);localeRef.current=locale;const t=(key,params)=>translate(localeRef.current,key,params);
  const [custom,setCustom]=useState([]),[ready,setReady]=useState(false);
  const [view,setView]=useState('全部声音'),[query,setQuery]=useState('');
  const [mix,setMix]=useState({}),[playing,setPlaying]=useState(false),[loading,setLoading]=useState({});
  const [master,setMaster]=useState(typeof initial.master==='number'?clamp(initial.master):.5);
  const [favorites,setFavorites]=useState(Array.isArray(initial.favorites)?initial.favorites:[]);
  const [saved,setSaved]=useState(Array.isArray(initial.saved)?initial.saved:[]);
  const [toast,setToast]=useState(''),[modal,setModal]=useState(null),[name,setName]=useState('');
  const [sleepAt,setSleepAt]=useState(0),[now,setNow]=useState(Date.now()),[importing,setImporting]=useState(false);
  const [reducedEffects,setReducedEffects]=useState(initial.reducedEffects);
  const [dynamicSoundscape,setDynamicSoundscape]=useState(initial.dynamicSoundscape);
  const [tone,setTone]=useState(initial.tone),[focusConfig,setFocusConfig]=useState(initial.focus);
  const [focusState,setFocusState]=useState({status:'idle',phase:'focus',cycle:0,remainingMs:0});
  const [undo,setUndo]=useState(null),[importReport,setImportReport]=useState(null);
  const [rotation,setRotation]=useState(initial.rotation),[rotationEnabled,setRotationEnabled]=useState(false);
  const [backgroundId,setBackgroundId]=useState(validateBackground(initial.backgroundId)),[animateBackground,setAnimateBackground]=useState(initial.animateBackground!==false);
  const commandRef=useRef();
  const [compactLayout,setCompactLayout]=useState(()=>matchMedia('(max-width:1050px)').matches);
  useEffect(()=>{const query=matchMedia('(max-width:1050px)');const change=()=>setCompactLayout(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
  useEffect(()=>{if(!compactLayout&&modal?.type==='mixer')setModal(null);},[compactLayout]);
  const [windowVisible,setWindowVisible]=useState(true);
  useEffect(()=>{let live=true;const update=state=>{if(live&&typeof state?.visible==='boolean')setWindowVisible(state.visible);};const off=window.desktop?.onWindowState?.(update);window.desktop?.windowState?.().then(update);return()=>{live=false;off?.();};},[]);
  const mixRef=useRef({}),playingRef=useRef(false),generation=useRef(0),switchingRef=useRef(false),toastTimer=useRef(),fileInput=useRef();
  const rotationCommand=useRef(),rotationRef=useRef(),focusRef=useRef(),focusCommand=useRef(),sleepRef=useRef(0),undoRef=useRef(null),undoTimer=useRef();
  const savedRef=useRef(saved),favoritesRef=useRef(favorites);favoritesRef.current=favorites;
  function updateSaved(value){const next=typeof value==='function'?value(savedRef.current):value;savedRef.current=next;setSaved(next);}
  if(!focusRef.current)focusRef.current=new FocusTimer({onChange:state=>focusCommand.current(state),canRun:()=>playingRef.current&&engine.playing&&(!engine.sleepAt||Date.now()<engine.sleepAt)});
  if(!rotationRef.current)rotationRef.current=new MixRotation({
    apply:id=>rotationCommand.current.apply(id),canRun:()=>playingRef.current&&engine.playing&&!(focusRef.current.status!=='idle'&&focusRef.current.phase==='rest')&&(!engine.sleepAt||Date.now()<engine.sleepAt-15000),
    cancelApply:()=>rotationCommand.current.cancel(),onStop:()=>setRotationEnabled(false),onError:error=>rotationCommand.current.error(error)
  });
  const sounds=[...catalog,...custom],byId=Object.fromEntries(sounds.map(s=>[s.id,s]));
  const eligibleSaved=saved.filter(p=>Object.entries(p.mix).some(([id,v])=>byId[id]&&v>0));
  const notify=message=>{setToast(t(message));clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),5000);};
  const updateMix=value=>{mixRef.current=value;setMix(value);};
  const cancelSwitch=()=>{if(switchingRef.current){generation.current++;switchingRef.current=false;engine.cancelMixSwitch();setLoading({});}};
  function stopRotation(){rotationRef.current.stop();setRotationEnabled(false);}
  function deleteSaved(id){
    const index=savedRef.current.findIndex(p=>p.id===id);if(index<0)return;
    if(rotation.ids.filter(value=>value!==id&&eligibleSaved.some(p=>p.id===value)).length<2)stopRotation();else rotationRef.current.playbackChanged();
    clearTimeout(undoTimer.current);const entry={mix:savedRef.current[index],index,expiresAt:Date.now()+8000};undoRef.current=entry;setUndo(entry);
    updateSaved(prev=>prev.filter(p=>p.id!==id));setRotation(prev=>({...prev,ids:prev.ids.filter(value=>value!==id)}));
    undoTimer.current=setTimeout(()=>{undoRef.current=null;setUndo(null);},8000);
  }
  function undoDelete(){const entry=undoRef.current;if(!entry||Date.now()>=entry.expiresAt)return;clearTimeout(undoTimer.current);if(!savedRef.current.some(p=>p.id===entry.mix.id)){const next=[...savedRef.current];next.splice(Math.min(entry.index,next.length),0,entry.mix);updateSaved(next);}undoRef.current=null;setUndo(null);}
  function pausePlayback(){playingRef.current=false;focusRef.current.pause();rotationRef.current.playbackChanged();cancelSwitch();setPlaying(false);engine.pause();}
  function endSleep(){if(!sleepRef.current)return;sleepRef.current=0;playingRef.current=false;focusRef.current.stop();stopRotation();cancelSwitch();engine.pause();engine.setSleep(0);setPlaying(false);setSleepAt(0);notify('睡眠定时已结束，声音已淡出');}
  function startFocus(){if(!playingRef.current||!engine.playing){notify('先播放声音，再开始专注循环');return;}if(sleepRef.current&&Date.now()>=sleepRef.current){endSleep();return;}focusRef.current.start(focusConfig);}
  focusCommand.current=state=>{setFocusState(state);engine.setFocusQuiet(state.status!=='idle'&&state.phase==='rest');rotationRef.current.playbackChanged();};
  async function backupExport(){const text=exportBackup({...readSettings(),saved:savedRef.current,favorites:favoritesRef.current});if(window.desktop?.saveBackup){const result=await window.desktop.saveBackup(text,localeRef.current);if(result?.error)throw Error('备份保存失败，请检查磁盘空间和权限');return;}const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='quiet-field-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function backupImport(data){const current={...readSettings(),master,mix:mixRef.current,saved:savedRef.current,favorites:favoritesRef.current,reducedEffects,locale,backgroundId,animateBackground,dynamicSoundscape,rotation,tone,focus:focusConfig};const result=commitBackup(localStorage,current,data,{reserve:undoRef.current?1:0});stopRotation();updateSaved(result.saved);setFavorites(result.favorites);return {...result,missing:data.saved.filter(p=>Object.keys(p.mix).some(id=>!byId[id])).length};}

  rotationCommand.current={apply:id=>{const selected=saved.find(p=>p.id===id);return selected?applyMix(selected.mix,{automatic:true,rotationId:id}):Promise.resolve(false);},cancel:cancelSwitch,error:error=>notify(t('轮播已停止：')+t(error.message))};
  useEffect(()=>{engine.setDynamic(dynamicSoundscape);},[dynamicSoundscape]);
  useEffect(()=>{engine.setTone(tone);},[tone]);
  useEffect(()=>{
    if(!ready)return;
    const eligibleIds=eligibleSaved.map(p=>p.id);
    const ids=rotation.ids.filter(id=>eligibleIds.includes(id));
    if(ids.length!==rotation.ids.length)setRotation(prev=>({...prev,ids}));
    rotationRef.current.configure({...rotation,enabled:rotationEnabled},eligibleIds);
  },[rotation,rotationEnabled,saved,custom,ready]);
  useEffect(()=>{rotationRef.current.playbackChanged();},[playing,sleepAt]);
  useEffect(()=>()=>{rotationRef.current.dispose();focusRef.current.dispose();clearTimeout(undoTimer.current);clearTimeout(toastTimer.current);},[]);
  useEffect(()=>{
    files('getAll').then(items=>{setCustom(items.map(({blob,...meta})=>meta));setReady(true);}).catch(()=>{setReady(true);notify('导入库读取失败，内置声音仍可使用');});
    engine.setMaster(master);
  },[]);
  useEffect(()=>{
    if(!ready)return;
    const restored=Object.fromEntries(Object.entries(initial.mix||{}).filter(([id])=>byId[id]).slice(0,8).map(([id,v])=>[id,trackVolume(v)]));
    updateMix(restored);
  },[ready]);
  useEffect(()=>{
    if(!ready)return;
    try{localStorage.setItem('quiet-field-settings',JSON.stringify({version:2,master,mix,favorites,saved,reducedEffects,locale,backgroundId,animateBackground,dynamicSoundscape,rotation,tone,focus:focusConfig}));}catch{notify('偏好保存失败，请检查磁盘可用空间');}
  },[master,mix,favorites,saved,ready,reducedEffects,locale,backgroundId,animateBackground,dynamicSoundscape,rotation,tone,focusConfig]);
  useEffect(()=>{
    const recover=()=>{setNow(Date.now());if(sleepRef.current&&Date.now()>=sleepRef.current){endSleep();return;}focusRef.current.reconcile();engine.recover().catch(()=>notify('音频设备暂不可用，点击播放重试'));};
    const off=window.desktop?.onResume?.(recover);navigator.mediaDevices?.addEventListener('devicechange',recover);
    return()=>{off?.();navigator.mediaDevices?.removeEventListener('devicechange',recover);};
  },[]);
  useEffect(()=>{if(!sleepAt&&focusState.status!=='running')return;setNow(Date.now());const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[sleepAt,focusState.status]);
  useEffect(()=>{if(!sleepAt)return;const deadline=sleepAt;let timer;const check=()=>{if(sleepRef.current!==deadline)return;const remaining=deadline-Date.now();if(remaining<=0)endSleep();else timer=setTimeout(check,remaining);};check();return()=>clearTimeout(timer);},[sleepAt]);
  useEffect(()=>{
    if(sleepAt&&now>=sleepAt)endSleep();
  },[now,sleepAt]);
  async function ensure(id,value,gen=generation.current) {
    if(gen!==generation.current||!(id in mixRef.current)||!byId[id])return;
    setLoading(prev=>({...prev,[id]:true}));
    try {await engine.add(byId[id],value);}
    catch(e) {
      if(gen===generation.current&&id in mixRef.current){const next={...mixRef.current};delete next[id];updateMix(next);notify(`${nameOf(byId[id])}: ${t(e.message)}`);if(!Object.keys(next).length){pausePlayback();}}
    } finally {setLoading(prev=>{const next={...prev};delete next[id];return next;});}
  }
  async function playPause() {
    if(playingRef.current){pausePlayback();return;}
    if(!Object.keys(mixRef.current).length){notify('先选一种声音，或试试上面的组合');return;}
    try {
      playingRef.current=true;setPlaying(true);await engine.play();
      if(!playingRef.current)return;focusRef.current.resume();
      await Promise.all(Object.entries(mixRef.current).map(([id,v])=>ensure(id,v)));
      if(!Object.keys(mixRef.current).length){pausePlayback();}
    }catch(e){pausePlayback();notify(t('无法启动声音：')+t(e.message));}
  }
  function remove(id) {
    stopRotation();cancelSwitch();
    const next={...mixRef.current};delete next[id];updateMix(next);engine.remove(id);
    if(!Object.keys(next).length){pausePlayback();}
  }
  async function toggle(sound) {
    stopRotation();cancelSwitch();
    if(sound.id in mixRef.current){remove(sound.id);return;}
    if(Object.keys(mixRef.current).length>=8){notify('最多同时混合 8 种声音，先移除一种再添加');return;}
    updateMix({...mixRef.current,[sound.id]:.45});
    try{playingRef.current=true;setPlaying(true);await engine.play();if(playingRef.current)await ensure(sound.id,.45);}catch(e){pausePlayback();notify(e.message);}
  }
  function volume(id,value) {cancelSwitch();updateMix({...mixRef.current,[id]:value});engine.volume(id,value);}
  async function applyMix(next,{automatic=false,rotationId=null}={}) {
    if(automatic&&(!playingRef.current||!engine.playing||(focusRef.current.status!=='idle'&&focusRef.current.phase==='rest')||(engine.sleepAt&&Date.now()>=engine.sleepAt-15000)))return false;
    if(!automatic)stopRotation();
    const gen=++generation.current;
    const clean=Object.fromEntries(Object.entries(next).filter(([id])=>byId[id]).slice(0,8).map(([id,v])=>[id,trackVolume(v)]));
    if(!Object.keys(clean).length){cancelSwitch();engine.cancelMixSwitch();for(const id of engine.tracks.keys())engine.remove(id);updateMix({});pausePlayback();return false;}
    switchingRef.current=true;setLoading(Object.fromEntries(Object.keys(clean).map(id=>[id,true])));
    try {
      if(!automatic){playingRef.current=true;setPlaying(true);}
      const committed=await engine.switchMix(Object.entries(clean).map(([id,v])=>[byId[id],v]));
      if(committed&&gen===generation.current){updateMix(clean);rotationRef.current.noteCurrent(rotationId);if(!automatic)rotationRef.current.playbackChanged();}
      else if(gen===generation.current){playingRef.current=engine.playing;setPlaying(engine.playing);}
      return committed&&gen===generation.current;
    }catch(e){
      if(gen===generation.current){if(!Object.keys(mixRef.current).length)engine.pause();playingRef.current=engine.playing;setPlaying(engine.playing);if(!automatic)notify(e.message);}
      if(automatic)throw e;return false;
    }finally{if(gen===generation.current){switchingRef.current=false;setLoading({});}}
  }
  function favorite(id) {setFavorites(prev=>{if(prev.includes(id))return prev.filter(x=>x!==id);if(prev.length>=MAX_FAVORITES){notify('收藏数量超过备份上限');return prev;}return [...prev,id];});}
  function setTimer(minutes) {if(!Number.isInteger(minutes)||minutes<0||minutes>720)return;const deadline=minutes?Date.now()+minutes*60000:0;sleepRef.current=deadline;setNow(Date.now());setSleepAt(deadline);engine.setSleep(deadline);}
  function extendTimer(){if(!sleepRef.current)return;const deadline=Math.min(Math.max(Date.now(),sleepRef.current)+600000,Date.now()+720*60000);sleepRef.current=deadline;setNow(Date.now());setSleepAt(deadline);engine.setSleep(deadline);}
  async function importAudio(event) {
    const selected=Array.from(event.target.files||[]);event.target.value='';if(!selected.length)return;
    const report={success:[],failed:[]};setImportReport(report);setImporting(true);
    if(selected.length>20){setImportReport({success:[],failed:selected.map(file=>({name:file.name,reason:'每批最多导入 20 段音频'}))});setImporting(false);return;}
    for(const file of selected){
      try{
        if(file.size>40*1024*1024)throw new Error('单个文件不能超过 40 MB');await probeAudio(file);const decoded=await engine.inspectImport(file);
        const record={id:'custom-'+crypto.randomUUID(),name:file.name.replace(/\.[^.]+$/,''),category:'导入',group:'custom',custom:true,duration:decoded.duration,sampleRate:decoded.sampleRate,channels:decoded.numberOfChannels,format:file.name.split('.').at(-1).toUpperCase(),blob:file};
        await files('put',record);const {blob,...meta}=record;setCustom(prev=>[...prev,meta]);report.success.push(file.name);
      }catch(e){report.failed.push({name:file.name,reason:e.message});}
      setImportReport({success:[...report.success],failed:[...report.failed]});
    }
    setImporting(false);if(report.success.length){setView('导入');setQuery('');}notify('导入完成，详细结果可在导入音频中查看');
  }
  async function deleteCustom(sound) {
    remove(sound.id);engine.cache.delete(sound.id);await files('delete',sound.id);setCustom(prev=>prev.filter(s=>s.id!==sound.id));setFavorites(prev=>prev.filter(id=>id!==sound.id));updateSaved(prev=>prev.map(p=>({...p,mix:Object.fromEntries(Object.entries(p.mix).filter(([id])=>id!==sound.id))})));setModal(null);notify('已移除导入副本，原文件未改动');
  }
  useEffect(()=>{
    const handler=e=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();playPause();}};
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  });
  const active=Object.entries(mix).filter(([id])=>byId[id]);
  const filtered=sounds.filter(s=>(view==='全部声音'||view==='我的收藏'&&favorites.includes(s.id)||s.category===view)&&matchesSound(s,query));
  const remain=Math.max(0,Math.ceil((sleepAt-now)/1000));
  const timeLabel=`${Math.floor(remain/60).toString().padStart(2,'0')}:${(remain%60).toString().padStart(2,'0')}`;
  const desktopMixes=[...presets.map((p,i)=>({id:'preset-'+i,name:t(p.name)})),...saved.map(p=>({id:'saved-'+p.id,name:p.name}))];
  commandRef.current=c=>{if(c.type==='toggle')playPause();else if(c.type==='master'){setMaster(c.value);engine.setMaster(c.value);}else if(c.type==='mix'){const index=desktopMixes.findIndex(m=>m.id===c.id);if(index>=0)applyMix(index<presets.length?presets[index].mix:saved[index-presets.length].mix);}};
  useEffect(()=>window.desktop?.onCompanionCommand?.(c=>commandRef.current?.(c)),[]);
  useEffect(()=>{window.desktop?.companionUpdate?.({ready,playing,master,locale,activeCount:active.length,label:active.map(([id])=>nameOf(byId[id])).join(' · '),sleepLabel:sleepAt?t('剩余 {time}',{time:timeLabel}):'',loading:Object.keys(loading).length>0,mixes:desktopMixes});},[ready,playing,master,locale,mix,saved,loading,sleepAt,timeLabel,custom]);
  function navigate(label){setView(label);setQuery('');document.querySelector('main')?.scrollTo({top:0});}
  const mixerContent=<div className="mixer"><div className="offline-note"><span className="status-dot"/>{t("离线使用 · 本地声音，无需网络")}</div><div className="mixer-header"><h2>{t("当前混音")}</h2><span>{active.length?`${active.length} / 8`:''}</span></div><div className="mix-list">{active.length===0?<div className="mix-empty"><Headphones size={35} strokeWidth={1.2}/><p>{t("从左边选一种声音")}<br/>{t("慢慢调成你喜欢的样子")}</p></div>:active.map(([id,v])=><div className="mix-track" key={id}><Icon sound={byId[id]} size={29} strokeWidth={1.3}/><div className="mix-track-main"><div className="mix-name"><span>{nameOf(byId[id])}</span><span>{loading[id]?t("准备中"):`${Math.round(v*100)}%`}</span></div><Slider label={t("混音 {sound}音量",{sound:nameOf(byId[id])})} value={v} onChange={value=>volume(id,value)}/></div><button className="icon-button" aria-label={t("从混音移除{sound}",{sound:nameOf(byId[id])})} onClick={()=>remove(id)}><X size={17}/></button></div>)}</div>
      <p className="gain-hint"><Check size={14}/>{t("响度已平衡 · 可增强至 300%")}</p><div className="mix-actions"><button className="primary" disabled={!active.length} onClick={()=>{setName('');setModal({type:'save'});}}><Save size={17}/>{t("保存组合")}</button><button className="outline" disabled={!active.length} onClick={()=>applyMix({})}><Trash2 size={16}/>{t("清空")}</button></div>
      <TimerPanel sleepAt={sleepAt} now={now} onSleep={setTimer} onExtend={extendTimer} focus={focusState.status==='running'?focusRef.current.snapshot():focusState} config={focusConfig} onConfig={setFocusConfig} onStart={startFocus} onToggle={playPause} onStop={()=>focusRef.current.stop()} playing={playing}/>

    </div>;
  return <div className={`app${playing?' is-playing':''}${reducedEffects?' reduced-effects':''}`}>
    <BackgroundScene backgroundId={backgroundId} animateBackground={animateBackground} reducedEffects={reducedEffects||!windowVisible}/>
    <WindowChrome/>
    <aside className="sidebar">
      <div className="sidebar-heading"><div className="brand"><img className="brand-icon" src="./icon.png" width="38" height="38" alt=""/><span>{t("静野")}</span></div><p className="tagline">{t("留一点安静给自己")}</p></div>
      <nav aria-label={t("声音分类")}>
        {[['全部声音',AudioLines],['我的收藏',Heart],['我的组合',LayoutGrid]].map(([label,NavIcon])=><button key={label} className={view===label?'nav-item selected':'nav-item'} onClick={()=>navigate(label)}><NavIcon size={21}/><span>{t(label)}</span></button>)}
        <div className="nav-divider"/>
        {Object.entries(categoryIcons).map(([label,NavIcon])=><button key={label} className={view===label?'nav-item selected':'nav-item'} onClick={()=>navigate(label)}><NavIcon size={20}/><span>{t(label)}</span></button>)}
      </nav>
      <div className="sidebar-bottom"><button className="settings-button" onClick={()=>setModal({type:'settings'})}><Settings size={16}/>{t("设置")}</button>
      {window.desktop&&<button className="companion-button" onClick={()=>window.desktop.companionAction('mini')}><PictureInPicture2 size={16}/>{t("迷你播放器")}</button>}
      <button className="version-entry" onClick={()=>setModal({type:'settings',tab:'about'})}>{__APP_VERSION__}{__REVIEW_BUILD__?' · '+t('本地审核版'):''}</button>
      {__PUBLIC_LIBRARY__&&!__REVIEW_BUILD__&&window.desktop&&<UpdateCenter/>}
      </div>
    </aside>
    <main>
      <div className="toolbar"><label className="search"><Search size={20}/><input aria-label={t("搜索声音")} placeholder={t("搜索声音")} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label={t("清除搜索")} className="icon-button" onClick={()=>setQuery('')}><X size={16}/></button>}</label><button className="outline import-button" disabled={importing} onClick={()=>setModal({type:'import'})}>{importing?<LoaderCircle className="spin" size={18}/>:<FolderOpen size={18}/>} {importing?t("正在导入"):t("导入音频")}</button><input ref={fileInput} type="file" accept="audio/*,.flac,.ogg,.wav,.mp3,.m4a" multiple hidden onChange={importAudio}/></div>
      <section className="intro"><div><h1>{t("今天，听见宁静。")}</h1><p>{t("选几种声音，调成自己的节奏。")}</p></div><Visualizer engine={engine} playing={playing} disabled={reducedEffects||!windowVisible}/></section>
      <div className="presets">{presets.map(p=><button className="outline" key={p.name} onClick={()=>applyMix(p.mix)}>{t(p.name)}</button>)}</div>
      <div className="section-title"><h2>{t(view==='全部声音'?'声音库':view)}</h2><span className="line"/><span>{view==='我的组合'?saved.length:filtered.length}</span></div>
      {view==='我的组合'?<><RotationPanel saved={saved} eligibleIds={eligibleSaved.map(p=>p.id)} options={rotation} enabled={rotationEnabled} playing={playing} onEnabled={value=>{if(!value)rotationRef.current.stop();setRotationEnabled(value);}} onOptions={setRotation}/><div className="saved-list">{saved.length===0?<div className="empty"><LayoutGrid/><h3>{t("把喜欢的氛围留下来")}</h3><p>{t("选好声音和音量，再到「当前混音」保存组合。")}</p></div>:saved.map(p=><article className="saved-item" key={p.id}><div><h3>{p.name}</h3><p>{Object.keys(p.mix).map(id=>byId[id]?nameOf(byId[id]):null).filter(Boolean).join(' · ')||t("声音已移除")}</p></div><button className="outline" onClick={()=>applyMix(p.mix,{rotationId:p.id})}><Play size={16}/>{t("播放")}</button><button className="icon-button" aria-label={t("删除组合 {name}",{name:p.name})} onClick={()=>deleteSaved(p.id)}><Trash2 size={17}/></button></article>)}</div></>:<div className="sound-grid">{filtered.map(sound=>{
        const selected=sound.id in mix;
        return <article key={sound.id} className={`sound-card ${selected?'active':''}`}>
          <button className="sound-toggle" aria-label={t(selected?'移除{sound}':'播放{sound}',{sound:nameOf(sound)})} aria-pressed={selected} onClick={()=>toggle(sound)}><Icon sound={sound} size={37} strokeWidth={1.35}/><span>{nameOf(sound)}</span>{loading[sound.id]&&<LoaderCircle size={14} className="spin"/>}</button>
          <button className={`favorite icon-button ${favorites.includes(sound.id)?'is-favorite':''}`} aria-label={t(favorites.includes(sound.id)?'取消收藏{sound}':'收藏{sound}',{sound:nameOf(sound)})} onClick={()=>favorite(sound.id)}><Heart size={15}/></button>
          <div className="card-bottom">{selected?<><Volume2 size={14}/><Slider label={t("{sound}音量",{sound:nameOf(sound)})} value={mix[sound.id]} onChange={v=>volume(sound.id,v)}/><span className="volume-number">{Math.round(mix[sound.id]*100)}</span></>:<><span className="sound-kind">{t(sound.format==='WAV'?'WAV 原文件':sound.category)}</span><span className="idle-line"/></>}<button className="icon-button details-button" aria-label={t("{sound}详情",{sound:nameOf(sound)})} onClick={()=>setModal({type:'sound',sound})}><Info size={14}/></button></div>
        </article>;
      })}{!filtered.length&&<div className="empty"><Search/><h3>{query?t("没有找到这个声音"):view==='导入'?t("带上自己的声音"):t("这里还很安静")}</h3><p>{view==='导入'?t("支持 WAV、FLAC、MP3、OGG 等格式，保存在本机。"):t("试试其他关键词，或点击爱心收藏喜欢的声音。")}</p></div>}</div>}
    </main>
    {!compactLayout&&mixerContent}

    <footer className="transport"><button className="play-button" aria-label={playing?t("暂停全部"):t("播放全部")} title={t("空格键播放 / 暂停")} onClick={playPause}>{playing?<Pause fill="currentColor" size={25}/>:<Play fill="currentColor" size={25}/>}</button><div className="play-status"><strong>{playing?t(focusState.phase==='rest'&&focusState.status!=='idle'?'休息静音中':'正在播放'):t('已暂停')}</strong><span>{Object.keys(loading).length?t("正在准备声音…"):t("空格键播放 / 暂停")}</span></div><div className="sound-count">{t("{count} 种声音",{count:active.length})}</div><Visualizer engine={engine} playing={playing} disabled={reducedEffects||!windowVisible} mode="bars"/><div className="master"><span>{t("总音量")}</span><Volume2 size={18}/><Slider label={t("总音量")} max={100} value={master} onChange={v=>{setMaster(v);engine.setMaster(v);}}/><span className="volume-number">{Math.round(master*100)}%</span></div>{compactLayout&&<button className="compact-mixer-button" onClick={()=>setModal({type:'mixer'})} aria-haspopup="dialog" aria-label={t("打开当前混音")}><AudioLines size={18}/><span>{t("混音")}</span><span className="compact-mixer-count">{active.length}</span></button>}<div className="local-status"><span className="status-dot"/>{t("本地播放 · 无缝循环")}<Repeat2 size={18}/></div></footer>
    {toast&&<div role="status" className="toast">{toast}</div>}
    {undo&&<div className="undo-notice" role="status">{t('已删除组合 {name}',{name:undo.mix.name})}<button className="outline" onClick={undoDelete}>{t('撤销删除')}</button></div>}
    {modal?.type==='mixer'&&compactLayout&&<Modal title={t("当前混音")} onClose={()=>setModal(null)}>{mixerContent}</Modal>}
    {modal?.type==='settings'&&<Modal title={t("设置")} className="settings-dialog" onClose={()=>setModal(null)}><SettingsPanel initialTab={modal.tab} tone={tone} onTone={setTone} onExport={backupExport} onImportBackup={backupImport} dynamicSoundscape={dynamicSoundscape} onDynamic={setDynamicSoundscape} backgroundId={backgroundId} animateBackground={animateBackground} onBackground={setBackgroundId} onAnimate={setAnimateBackground} reducedEffects={reducedEffects} onReducedEffects={setReducedEffects} recordingCount={catalog.filter(s=>!s.generated).length}/></Modal>}
    {modal?.type==='save'&&<Modal title={t("保存这份宁静")} onClose={()=>setModal(null)}><form onSubmit={e=>{e.preventDefault();const trimmed=name.trim();if(!trimmed)return;if(savedRef.current.length+(undoRef.current?1:0)>=MAX_SAVED_MIXES){notify('组合上限为 1000，保存与恢复使用相同上限');return;}updateSaved(prev=>[...prev,{id:crypto.randomUUID(),name:trimmed,mix:{...mixRef.current}}]);setModal(null);notify('组合已保存在本机');}}><label className="field-label" htmlFor="mix-name">{t("给组合起个名字")}</label><input id="mix-name" autoFocus maxLength={32} placeholder={t("例如：雨夜书房")} value={name} onChange={e=>setName(e.target.value)}/><p className="muted">{t('会记住每种声音和各自的音量。')}{' '}{t('最多保存 1000 套组合。')}</p><button type="submit" className="primary" disabled={!name.trim()}><Check size={17}/>{t("保存组合")}</button></form></Modal>}
    {modal?.type==='import'&&<Modal title={t('导入音频')} onClose={()=>setModal(null)}><p>{t('每段最多 40 MB、5 分钟、单声道或双声道；每批最多 20 段。')}</p><p className="muted">{t('支持 WAV、FLAC、MP3、OGG、M4A；仅保存本地副本。')}</p><button className="primary" disabled={importing} onClick={()=>fileInput.current.click()}>{t(importing?'正在导入':'选择音频文件')}</button>{importReport&&<div className="import-report"><p role="status">{t('成功 {success} 段，失败 {failed} 段',{success:importReport.success.length,failed:importReport.failed.length})}</p>{importReport.success.length>0&&<details><summary>{t('成功文件')}</summary><ul>{importReport.success.map((name,i)=><li key={i}>{name}</li>)}</ul></details>}{importReport.failed.length>0&&<ul>{importReport.failed.map((item,i)=><li key={i}>{item.name}: {t(item.reason)}</li>)}</ul>}</div>}</Modal>}
    {modal?.type==='sound'&&<Modal title={nameOf(modal.sound)} onClose={()=>setModal(null)}><dl><dt>{t("来源")}</dt><dd>{modal.sound.custom?t("你导入的本地文件"):modal.sound.generated?t("本机算法生成"):modal.sound.sourceLabel||t("Moodist 公开音频库")}</dd>{modal.sound.license&&<><dt>{t("作者与授权")}</dt><dd>{modal.sound.author} · {modal.sound.license}</dd><dt>{t("来源网址")}</dt><dd style={{overflowWrap:"anywhere"}}>{modal.sound.source}</dd></>}<dt>{t("文件格式")}</dt><dd>{t(modal.sound.format)}{modal.sound.bitDepth?` · ${modal.sound.bitDepth} bit PCM`:''}{modal.sound.bitrate?` · ${t("约 {bitrate} kbps",{bitrate:modal.sound.bitrate})}`:''}</dd><dt>{t("采样率 / 声道")}</dt><dd>{modal.sound.sampleRate/1000} kHz · {modal.sound.channels===2?t("立体声"):t("单声道")}{modal.sound.custom?t("（解码规格）"):''}</dd>{modal.sound.duration&&<><dt>{t("原始长度")}</dt><dd>{t("{seconds} 秒",{seconds:Math.round(modal.sound.duration)})}</dd></>}{modal.sound.sourceNote&&<><dt>{t("录音说明")}</dt><dd>{t(modal.sound.sourceNote)}</dd></>}<dt>{t("响度处理")}</dt><dd>{t(modal.sound.preserveLoudness?"已保留处理后的音量 · 峰值保护 · 最高 300%":"自动平衡基础响度 · 峰值保护 · 最高 300%") }</dd><dt>{t("循环处理")}</dt><dd>{t("首尾静音清理 · 最长 4 秒交叉淡化")}</dd></dl><p className="muted">{t("保留原文件，循环处理只在内存中进行。无损格式不代表原始录音一定无损；不会通过升采样冒充更高音质。")}</p>{modal.sound.custom&&<button className="outline danger" onClick={()=>deleteCustom(modal.sound)}><Trash2 size={16}/>{t("删除导入副本")}</button>}</Modal>}
  </div>;
}
createRoot(document.getElementById('root')).render(<LocaleProvider><ErrorBoundary>{miniMode?<MiniPlayer/>:<App/>}</ErrorBoundary></LocaleProvider>);


