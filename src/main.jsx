import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AudioLines,Heart,LayoutGrid,Leaf,CloudRain,Bird,House,Car,Building2,Coffee,Search,FolderOpen,Play,Pause,Volume2,X,Save,Trash2,Clock,Repeat2,Wind,Waves,Flame,Trees,CloudLightning,Headphones,Info,Check,Plus,Music2,TrainFront,Keyboard,LoaderCircle,Download} from 'lucide-react';
import catalog from '#catalog';
import {AudioEngine} from './engine.js';
import {files,readSettings} from './storage.js';
import {trackVolume,masterVolume} from './loudness.js';
import {Visualizer} from './Visualizer.jsx';
import {WindowChrome} from './WindowChrome.jsx';
import {ErrorBoundary} from './ErrorBoundary.jsx';
import {probeAudio} from './audio-budget.js';
import './style.css';
import './premium.css';
import './alpine.css';

const engine=new AudioEngine();
const categoryIcons={'自然':Leaf,'雨声':CloudRain,'动物':Bird,'城市':Building2,'场所':House,'交通':Car,'物品':Coffee,'噪音':AudioLines,'导入':Music2};
const specialIcons={'light-rain':CloudRain,'wind-in-trees':Trees,'waves':Waves,'campfire':Flame,'river':Waves,'thunder':CloudLightning,'cafe':Coffee,'wind':Wind,'howling-wind':Wind,'inside-a-train':TrainFront,'keyboard':Keyboard,'bsb-0229':Keyboard,'bsb-2838':Keyboard,'bsb-2816':Clock,'bsb-3598':Wind,'bsb-0078':Wind,'bsb-0904':Trees,'bsb-0987':Flame,'bsb-2857':Flame,'bsb-2727':TrainFront,'bsb-3040':TrainFront,'bsb-0635':TrainFront,'bsb-1447':Waves,'bsb-3222':Waves,'bsb-0507':Waves,'bsb-2687':Music2};
const presets=__PUBLIC_LIBRARY__?[{name:'深林细雨',mix:{'blanket-rain':.55,'blanket-wind':.35,'blanket-birds':.15}},{name:'海边放空',mix:{'blanket-waves':.65,'blanket-wind':.2}},{name:'深夜专注',mix:{'brown-noise':.55,'wav-rain-house':.25}}]:[{name:'深林细雨',mix:{'light-rain':.55,'wind-in-trees':.35,birds:.15}},{name:'海边放空',mix:{waves:.65,wind:.2}},{name:'深夜专注',mix:{'brown-noise':.55,'rain-on-window':.25}}];
const initial=readSettings();
const clamp=masterVolume;
function Icon({sound,...props}) {const Component=specialIcons[sound.id]||categoryIcons[sound.category]||Music2;return <Component {...props}/>;}
function Slider({label,value,onChange,max=300}) {return <input aria-label={label} aria-valuetext={`${Math.round(value*100)}%`} title={max===300?'100% 为平衡后标准音量，最高可增强至 300%':label} type="range" min="0" max={max} value={Math.round(value*100)} style={{'--value':`${value*100/max*100}%`}} onChange={e=>onChange(Number(e.target.value)/100)}/>;}
function Modal({title,onClose,children}) {
  const ref=useRef();
  useEffect(()=>{ref.current.showModal();return()=>ref.current?.close();},[]);
  return <dialog ref={ref} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><header><h2>{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X/></button></header>{children}</dialog>;
}

function App() {
  const [custom,setCustom]=useState([]),[ready,setReady]=useState(false);
  const [view,setView]=useState('全部声音'),[query,setQuery]=useState('');
  const [mix,setMix]=useState({}),[playing,setPlaying]=useState(false),[loading,setLoading]=useState({});
  const [master,setMaster]=useState(typeof initial.master==='number'?clamp(initial.master):.5);
  const [favorites,setFavorites]=useState(Array.isArray(initial.favorites)?initial.favorites:[]);
  const [saved,setSaved]=useState(Array.isArray(initial.saved)?initial.saved:[]);
  const [toast,setToast]=useState(''),[modal,setModal]=useState(null),[name,setName]=useState('');
  const [sleepAt,setSleepAt]=useState(0),[now,setNow]=useState(Date.now()),[importing,setImporting]=useState(false);
  const [reducedEffects,setReducedEffects]=useState(initial.reducedEffects);
  const mixRef=useRef({}),playingRef=useRef(false),generation=useRef(0),toastTimer=useRef(),fileInput=useRef();
  const sounds=[...catalog,...custom],byId=Object.fromEntries(sounds.map(s=>[s.id,s]));
  const notify=message=>{setToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),5000);};
  const updateMix=value=>{mixRef.current=value;setMix(value);};
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
    try{localStorage.setItem('quiet-field-settings',JSON.stringify({version:2,master,mix,favorites,saved,reducedEffects}));}catch{notify('偏好保存失败，请检查磁盘可用空间');}
  },[master,mix,favorites,saved,ready,reducedEffects]);
  useEffect(()=>{
    const recover=()=>{setNow(Date.now());engine.recover().catch(()=>notify('音频设备暂不可用，点击播放重试'));};
    const off=window.desktop?.onResume?.(recover);navigator.mediaDevices?.addEventListener('devicechange',recover);
    return()=>{off?.();navigator.mediaDevices?.removeEventListener('devicechange',recover);};
  },[]);
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
  useEffect(()=>{
    if(sleepAt&&now>=sleepAt){engine.pause();engine.setSleep(0);playingRef.current=false;setPlaying(false);setSleepAt(0);notify('睡眠定时已结束，声音已淡出');}
  },[now,sleepAt]);
  async function ensure(id,value,gen=generation.current) {
    if(gen!==generation.current||!(id in mixRef.current)||!byId[id])return;
    setLoading(prev=>({...prev,[id]:true}));
    try {await engine.add(byId[id],value);}
    catch(e) {
      if(gen===generation.current&&id in mixRef.current){const next={...mixRef.current};delete next[id];updateMix(next);notify(`${byId[id]?.name}：${e.message}`);if(!Object.keys(next).length){engine.pause();playingRef.current=false;setPlaying(false);}}
    } finally {setLoading(prev=>{const next={...prev};delete next[id];return next;});}
  }
  async function playPause() {
    if(playingRef.current){playingRef.current=false;setPlaying(false);engine.pause();return;}
    if(!Object.keys(mixRef.current).length){notify('先选一种声音，或试试上面的组合');return;}
    try {
      playingRef.current=true;setPlaying(true);await engine.play();
      if(!playingRef.current)return;
      await Promise.all(Object.entries(mixRef.current).map(([id,v])=>ensure(id,v)));
      if(!Object.keys(mixRef.current).length){engine.pause();playingRef.current=false;setPlaying(false);}
    }catch(e){engine.pause();playingRef.current=false;setPlaying(false);notify('无法启动声音：'+e.message);}
  }
  function remove(id) {
    const next={...mixRef.current};delete next[id];updateMix(next);engine.remove(id);
    if(!Object.keys(next).length){engine.pause();playingRef.current=false;setPlaying(false);}
  }
  async function toggle(sound) {
    if(sound.id in mixRef.current){remove(sound.id);return;}
    if(Object.keys(mixRef.current).length>=8){notify('最多同时混合 8 种声音，先移除一种再添加');return;}
    updateMix({...mixRef.current,[sound.id]:.45});
    try{playingRef.current=true;setPlaying(true);await engine.play();if(playingRef.current)await ensure(sound.id,.45);}catch(e){engine.pause();playingRef.current=false;setPlaying(false);notify(e.message);}
  }
  function volume(id,value) {updateMix({...mixRef.current,[id]:value});engine.volume(id,value);}
  async function applyMix(next) {
    const gen=++generation.current;for(const id of engine.tracks.keys())engine.remove(id);
    const clean=Object.fromEntries(Object.entries(next).filter(([id])=>byId[id]).slice(0,8).map(([id,v])=>[id,trackVolume(v)]));
    updateMix(clean);
    if(!Object.keys(clean).length){engine.pause();setPlaying(false);playingRef.current=false;return;}
    try {playingRef.current=true;setPlaying(true);await engine.play();
      if(gen!==generation.current||!playingRef.current)return;
      await Promise.all(Object.entries(clean).map(([id,v])=>ensure(id,v,gen)));
    }catch(e){engine.pause();playingRef.current=false;setPlaying(false);notify(e.message);}
  }
  function favorite(id) {setFavorites(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);}
  function setTimer(minutes) {const deadline=minutes?Date.now()+minutes*60000:0;setSleepAt(deadline);engine.setSleep(deadline);}
  async function importAudio(event) {
    const selected=Array.from(event.target.files||[]);event.target.value='';if(!selected.length)return;
    setImporting(true);let added=0;
    for(const file of selected) {
      try {
        if(file.size>40*1024*1024)throw new Error('单个文件不能超过 40 MB');
        await probeAudio(file);
        const decoded=await engine.inspectImport(file);
        const record={id:'custom-'+crypto.randomUUID(),name:file.name.replace(/\.[^.]+$/,''),category:'导入',group:'custom',custom:true,duration:decoded.duration,sampleRate:decoded.sampleRate,channels:decoded.numberOfChannels,format:file.name.split('.').at(-1).toUpperCase(),blob:file};
        await files('put',record);const {blob,...meta}=record;setCustom(prev=>[...prev,meta]);added++;
      }catch(e){notify(`${file.name}：${e.message}`);}
    }
    setImporting(false);if(added){setView('导入');setQuery('');notify(`已保存 ${added} 段音频到本机，下次打开仍可使用`);}
  }
  async function deleteCustom(sound) {
    remove(sound.id);engine.cache.delete(sound.id);await files('delete',sound.id);setCustom(prev=>prev.filter(s=>s.id!==sound.id));setFavorites(prev=>prev.filter(id=>id!==sound.id));setSaved(prev=>prev.map(p=>({...p,mix:Object.fromEntries(Object.entries(p.mix).filter(([id])=>id!==sound.id))})));setModal(null);notify('已移除导入副本，原文件未改动');
  }
  useEffect(()=>{
    const handler=e=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();playPause();}};
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  });
  const active=Object.entries(mix).filter(([id])=>byId[id]);
  const filtered=sounds.filter(s=>(view==='全部声音'||view==='我的收藏'&&favorites.includes(s.id)||s.category===view)&&(`${s.name} ${s.category} ${s.id}`).toLowerCase().includes(query.toLowerCase()));
  const remain=Math.max(0,Math.ceil((sleepAt-now)/1000));
  const timeLabel=`${Math.floor(remain/60).toString().padStart(2,'0')}:${(remain%60).toString().padStart(2,'0')}`;
  function navigate(label){setView(label);setQuery('');}
  return <div className={`app${playing?' is-playing':''}${reducedEffects?' reduced-effects':''}`}>
    <WindowChrome/>
    <aside className="sidebar">
      <div className="brand"><img className="brand-icon" src="./icon.png" width="38" height="38" alt=""/><span>静野</span></div><p className="tagline">留一点安静给自己</p>
      <nav aria-label="声音分类">
        {[['全部声音',AudioLines],['我的收藏',Heart],['我的组合',LayoutGrid]].map(([label,NavIcon])=><button key={label} className={view===label?'nav-item selected':'nav-item'} onClick={()=>navigate(label)}><NavIcon size={21}/><span>{label}</span></button>)}
        <div className="nav-divider"/>
        {Object.entries(categoryIcons).map(([label,NavIcon])=><button key={label} className={view===label?'nav-item selected':'nav-item'} onClick={()=>navigate(label)}><NavIcon size={20}/><span>{label}</span></button>)}
      </nav>
      <button className="about-button" onClick={()=>setModal({type:'about'})}><Info size={16}/> 关于声音与循环</button>
    </aside>
    <main>
      <div className="toolbar"><label className="search"><Search size={20}/><input aria-label="搜索声音" placeholder="搜索声音" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="清除搜索" className="icon-button" onClick={()=>setQuery('')}><X size={16}/></button>}</label><button className="outline import-button" disabled={importing} onClick={()=>fileInput.current.click()}>{importing?<LoaderCircle className="spin" size={18}/>:<FolderOpen size={18}/>} {importing?'正在导入':'导入音频'}</button><input ref={fileInput} type="file" accept="audio/*,.flac,.ogg,.wav,.mp3,.m4a" multiple hidden onChange={importAudio}/></div>
      <section className="intro"><div><h1>今天，听见宁静。</h1><p>选几种声音，调成自己的节奏。</p></div><Visualizer engine={engine} playing={playing} disabled={reducedEffects}/></section>
      <div className="presets">{presets.map(p=><button className="outline" key={p.name} onClick={()=>applyMix(p.mix)}>{p.name}</button>)}</div>
      <div className="section-title"><h2>{view==='全部声音'?'声音库':view}</h2><span className="line"/><span>{view==='我的组合'?saved.length:filtered.length}</span></div>
      {view==='我的组合'?<div className="saved-list">{saved.length===0?<div className="empty"><LayoutGrid/><h3>把喜欢的氛围留下来</h3><p>选好声音和音量，再点击右侧「保存组合」。</p></div>:saved.map(p=><article className="saved-item" key={p.id}><div><h3>{p.name}</h3><p>{Object.keys(p.mix).map(id=>byId[id]?.name).filter(Boolean).join(' · ')||'声音已移除'}</p></div><button className="outline" onClick={()=>applyMix(p.mix)}><Play size={16}/>播放</button><button className="icon-button" aria-label={`删除组合 ${p.name}`} onClick={()=>setSaved(prev=>prev.filter(x=>x.id!==p.id))}><Trash2 size={17}/></button></article>)}</div>:<div className="sound-grid">{filtered.map(sound=>{
        const selected=sound.id in mix;
        return <article key={sound.id} className={`sound-card ${selected?'active':''}`}>
          <button className="sound-toggle" aria-label={`${selected?'移除':'播放'}${sound.name}`} aria-pressed={selected} onClick={()=>toggle(sound)}><Icon sound={sound} size={37} strokeWidth={1.35}/><span>{sound.name}</span>{loading[sound.id]&&<LoaderCircle size={14} className="spin"/>}</button>
          <button className={`favorite icon-button ${favorites.includes(sound.id)?'is-favorite':''}`} aria-label={`${favorites.includes(sound.id)?'取消收藏':'收藏'}${sound.name}`} onClick={()=>favorite(sound.id)}><Heart size={15}/></button>
          <div className="card-bottom">{selected?<><Volume2 size={14}/><Slider label={`${sound.name}音量`} value={mix[sound.id]} onChange={v=>volume(sound.id,v)}/><span className="volume-number">{Math.round(mix[sound.id]*100)}</span></>:<><span className="sound-kind">{sound.format==='WAV'?'WAV 原文件':sound.category}</span><span className="idle-line"/></>}<button className="icon-button details-button" aria-label={`${sound.name}详情`} onClick={()=>setModal({type:'sound',sound})}><Info size={14}/></button></div>
        </article>;
      })}{!filtered.length&&<div className="empty"><Search/><h3>{query?'没有找到这个声音':view==='导入'?'带上自己的声音':'这里还很安静'}</h3><p>{view==='导入'?'支持 WAV、FLAC、MP3、OGG 等格式，保存在本机。':'试试其他关键词，或点击爱心收藏喜欢的声音。'}</p></div>}</div>}
    </main>
    <aside className="mixer"><div className="offline-note"><span className="status-dot"/>离线使用 · 本地声音，无需网络</div><div className="mixer-header"><h2>当前混音</h2><span>{active.length?`${active.length} / 8`:''}</span></div><div className="mix-list">{active.length===0?<div className="mix-empty"><Headphones size={35} strokeWidth={1.2}/><p>从左边选一种声音<br/>慢慢调成你喜欢的样子</p></div>:active.map(([id,v])=><div className="mix-track" key={id}><Icon sound={byId[id]} size={29} strokeWidth={1.3}/><div className="mix-track-main"><div className="mix-name"><span>{byId[id].name}</span><span>{loading[id]?'准备中':`${Math.round(v*100)}%`}</span></div><Slider label={`混音 ${byId[id].name}音量`} value={v} onChange={value=>volume(id,value)}/></div><button className="icon-button" aria-label={`从混音移除${byId[id].name}`} onClick={()=>remove(id)}><X size={17}/></button></div>)}</div>
      <p className="gain-hint"><Check size={14}/>响度已平衡 · 可增强至 300%</p><div className="mix-actions"><button className="primary" disabled={!active.length} onClick={()=>{setName('');setModal({type:'save'});}}><Save size={17}/>保存组合</button><button className="outline" disabled={!active.length} onClick={()=>applyMix({})}><Trash2 size={16}/>清空</button></div>
      <section className="timer"><h3>睡眠定时</h3><label><Clock size={18}/><select aria-label="睡眠定时" value={sleepAt?'active':'0'} onChange={e=>setTimer(Number(e.target.value))}><option value="0">不使用</option>{sleepAt&&<option value="active">剩余 {timeLabel}</option>}{[15,30,45,60,90,120].map(n=><option value={n} key={n}>{n} 分钟后停止</option>)}</select></label><p>{sleepAt?'结束前 15 秒缓缓淡出':'让声音陪你慢慢入睡'}</p></section>
    </aside>
    <footer className="transport"><button className="play-button" aria-label={playing?'暂停全部':'播放全部'} title="空格键播放 / 暂停" onClick={playPause}>{playing?<Pause fill="currentColor" size={25}/>:<Play fill="currentColor" size={25}/>}</button><div className="play-status"><strong>{playing?'正在播放':'已暂停'}</strong><span>{Object.keys(loading).length?'正在准备声音…':'空格键播放 / 暂停'}</span></div><div className="sound-count">{active.length} 种声音</div><Visualizer engine={engine} playing={playing} disabled={reducedEffects} mode="bars"/><div className="master"><span>总音量</span><Volume2 size={18}/><Slider label="总音量" max={100} value={master} onChange={v=>{setMaster(v);engine.setMaster(v);}}/><span className="volume-number">{Math.round(master*100)}%</span></div><div className="local-status"><span className="status-dot"/>本地播放 · 无缝循环<Repeat2 size={18}/></div></footer>
    {toast&&<div role="status" className="toast">{toast}</div>}
    {modal?.type==='save'&&<Modal title="保存这份宁静" onClose={()=>setModal(null)}><form onSubmit={e=>{e.preventDefault();const trimmed=name.trim();if(!trimmed)return;setSaved(prev=>[...prev,{id:crypto.randomUUID(),name:trimmed,mix:{...mixRef.current}}]);setModal(null);notify('组合已保存在本机');}}><label className="field-label" htmlFor="mix-name">给组合起个名字</label><input id="mix-name" autoFocus maxLength={32} placeholder="例如：雨夜书房" value={name} onChange={e=>setName(e.target.value)}/><p className="muted">会记住每种声音和各自的音量。</p><button type="submit" className="primary" disabled={!name.trim()}><Check size={17}/>保存组合</button></form></Modal>}
    {modal?.type==='sound'&&<Modal title={modal.sound.name} onClose={()=>setModal(null)}><dl><dt>来源</dt><dd>{modal.sound.custom?'你导入的本地文件':modal.sound.generated?'本机算法生成':modal.sound.sourceLabel||'Moodist 公开音频库'}</dd>{modal.sound.license&&<><dt>作者与授权</dt><dd>{modal.sound.author} · {modal.sound.license}</dd><dt>来源网址</dt><dd style={{overflowWrap:"anywhere"}}>{modal.sound.source}</dd></>}<dt>文件格式</dt><dd>{modal.sound.format}{modal.sound.bitDepth?` · ${modal.sound.bitDepth} bit PCM`:''}{modal.sound.bitrate?` · 约 ${modal.sound.bitrate} kbps`:''}</dd><dt>采样率 / 声道</dt><dd>{modal.sound.sampleRate/1000} kHz · {modal.sound.channels===2?'立体声':'单声道'}{modal.sound.custom?'（解码规格）':''}</dd>{modal.sound.duration&&<><dt>原始长度</dt><dd>{Math.round(modal.sound.duration)} 秒</dd></>}{modal.sound.sourceNote&&<><dt>录音说明</dt><dd>{modal.sound.sourceNote}</dd></>}<dt>响度处理</dt><dd>自动平衡基础响度 · 峰值保护 · 最高 300%</dd><dt>循环处理</dt><dd>首尾静音清理 · 最长 4 秒交叉淡化</dd></dl><p className="muted">保留原文件，循环处理只在内存中进行。无损格式不代表原始录音一定无损；不会通过升采样冒充更高音质。</p>{modal.sound.custom&&<button className="outline danger" onClick={()=>deleteCustom(modal.sound)}><Trash2 size={16}/>删除导入副本</button>}</Modal>}
    {modal?.type==='about'&&<Modal title="关于静野" onClose={()=>setModal(null)}><p>一间随时可以回来的安静房间。所有声音在本机播放，不需要账户，也不会上传你的录音。</p><h3>为什么循环更连贯？</h3><p>先清理首尾静音，再将首尾最多 4 秒交叉混合成连续波形，交给音频引擎直接循环。播放、暂停和调节音量也会平滑过渡。每段录音会先做基础响度平衡；100% 是平衡后的标准音量，可以继续推至 300%。</p><p className="muted">录音中的雷声、鸟鸣等事件仍会重复。系统主动休眠、合盖休眠或音频设备断开会影响播放；最小化窗口可以继续听。</p><h3>音源与授权</h3><p>内置 {catalog.filter(s=>!s.generated).length} 段录音和 3 种合成噪声。{__PUBLIC_LIBRARY__?"录音采用 CC0、Public Domain 或 CC BY 授权。每段录音的作者与授权可在声音详情及随附清单查看。":"个人音源库包含尚未逐段核实授权的 Moodist 音源，请勿将此版本作为公开音源包发布。"}</p><p className="muted">音源清单、真实规格、下载校验和授权文件随应用附带。请按各录音的许可保留署名。</p><h3>显示效果</h3><button className="outline" aria-pressed={reducedEffects} onClick={()=>setReducedEffects(v=>!v)}>{reducedEffects?"轻量模式已开启":"开启轻量模式"}</button><p className="muted">关闭频谱动画和背景模糊，降低图形负担。声音不受影响。</p><h3>键盘操作</h3><p>空格播放 / 暂停；Tab 切换控件；方向键调节音量。最多同时混合 8 种声音。关闭窗口即退出。</p></Modal>}
  </div>;
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);


