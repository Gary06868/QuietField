const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
const REPO='https://github.com/Gary06868/QuietField';
const ENDPOINT='https://api.github.com/repos/Gary06868/QuietField/releases/latest';
const DAY=86400000,MAX_PACKAGE=4*1024**3;
const versionParts=v=>typeof v==='string'&&/^v?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(v)?v.replace(/^v/,'').split('.').map(Number):null;
function newer(a,b){const x=versionParts(a),y=versionParts(b);if(!x||!y)return false;for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function parseRelease(data,current){
 if(!data||typeof data!=='object'||data.draft!==false||data.prerelease!==false||!versionParts(data.tag_name)||!newer(data.tag_name,current))return null;
 const version=data.tag_name.replace(/^v/,''),url=REPO+'/releases/tag/'+data.tag_name;if(data.html_url!==url)return null;
 const name=`QuietField-${version}-Windows-x64-public.zip`,assetURL=REPO+'/releases/download/'+data.tag_name+'/'+name;
 const a=(Array.isArray(data.assets)?data.assets:[]).find(a=>a&&a.name===name&&a.browser_download_url===assetURL&&a.state==='uploaded'&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=MAX_PACKAGE&&/^sha256:[a-f0-9]{64}$/.test(a.digest||''));
 return {version,url,notes:typeof data.body==='string'?data.body.slice(0,4000):'',asset:a?{name,url:assetURL,size:a.size,sha256:a.digest.slice(7)}:null};
}
function isAllowedURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
 if(u.origin==='https://api.github.com')return u.href===ENDPOINT;
 if(u.origin==='https://github.com')return /^\/Gary06868\/QuietField\/releases\/download\/v?\d+\.\d+\.\d+\/QuietField-[\d.]+-Windows-x64-public\.zip$/.test(u.pathname)&&!u.search;
 return u.origin==='https://release-assets.githubusercontent.com'&&u.pathname.startsWith('/github-production-release-asset/');
 }catch{return false;}}
const error=code=>Object.assign(new Error(code),{code});
async function requestGitHub(url,signal){
 for(let hop=0;hop<5;hop++){
  if(!isAllowedURL(url))throw error('untrusted-source');
  const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),20000);
  let response;try{response=await globalThis.fetch(url,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',headers:{'User-Agent':'QuietField-Update-Check','Accept':'application/vnd.github+json'},signal:signal?AbortSignal.any([signal,timeout.signal]):timeout.signal});}finally{clearTimeout(timer);}
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw error('network');url=new URL(location,url).href;continue;}
  if(!response.ok){await response.body?.cancel();throw error(response.status===403||response.status===429?'rate-limited':'network');}return response;
 }throw error('untrusted-source');
}
async function fetchRelease(signal){const response=await requestGitHub(ENDPOINT,signal);let bytes=0,parts=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>1024*1024){throw error('invalid-response');}parts.push(Buffer.from(chunk));}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw error('invalid-response');}}
async function downloadAsset(asset,file,signal,onProgress=()=>{}){
 const stalled=new AbortController(),combined=signal?AbortSignal.any([signal,stalled.signal]):stalled.signal;let watchdog;const reset=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>stalled.abort(),60000);};reset();
 let response,handle;try{response=await requestGitHub(asset.url,combined);handle=await fs.open(file,'wx');}catch(e){clearTimeout(watchdog);stalled.abort();if(response?.body){try{await response.body.cancel();}catch{}}throw e;}const hash=crypto.createHash('sha256');let bytes=0,last=0;
 try{for await(const chunk of response.body){reset();combined.throwIfAborted();bytes+=chunk.length;if(bytes>asset.size)throw error('checksum');hash.update(chunk);await handle.writeFile(chunk);if(Date.now()-last>200){last=Date.now();onProgress(bytes,asset.size);}}if(bytes!==asset.size||hash.digest('hex')!==asset.sha256)throw error('checksum');onProgress(bytes,asset.size);}
 catch(e){stalled.abort();try{await handle.close();}catch{}await fs.unlink(file).catch(()=>{});throw e;}finally{clearTimeout(watchdog);}await handle.close();
}
async function createUpdateService({version,prefsPath,fetcher=fetchRelease,installer,notify=()=>{},now=Date.now,canInstall=false}){
 let prefs={autoCheck:true,lastCheck:0,readVersion:null,release:null};try{const data=JSON.parse(await fs.readFile(prefsPath,'utf8'));prefs={autoCheck:data.autoCheck!==false,lastCheck:Number.isFinite(data.lastCheck)&&data.lastCheck<=now()?data.lastCheck:0,readVersion:versionParts(data.readVersion)?data.readVersion:null,release:data.release||null};}catch{}
 let latest=parseRelease(prefs.release,version),phase=latest?'available':'idle',failure=null,progress=0,bytes=0,total=0,busy=null,abort=null,closed=false,saving=Promise.resolve();
 const snapshot=()=>({version,autoCheck:prefs.autoCheck,lastCheck:prefs.lastCheck,phase,error:failure,progress,bytes,total,latest:latest?{version:latest.version,url:latest.url,notes:latest.notes,size:latest.asset?.size||0,canInstall:canInstall&&!!latest.asset}:null,unread:!!latest&&prefs.readVersion!==latest.version});
 const emit=()=>{if(!closed)notify(snapshot());};
 const save=()=>{const data=JSON.stringify(prefs);saving=saving.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(prefsPath),{recursive:true});const temp=prefsPath+'.tmp';await fs.writeFile(temp,data);await fs.rename(temp,prefsPath);}).catch(()=>{failure='settings';emit();});return saving;};
 async function check(manual=false){
  if(closed||busy||(!manual&&(!prefs.autoCheck||now()-prefs.lastCheck<DAY)))return snapshot();
  phase='checking';failure=null;prefs.lastCheck=now();emit();abort=new AbortController();const timeout=setTimeout(()=>abort?.abort(),25000);
  busy=Promise.resolve().then(async()=>{try{const raw=await fetcher(abort.signal);if(closed)return;prefs.lastCheck=now();prefs.release=raw;latest=parseRelease(raw,version);phase=latest?'available':'current';await save();}
   catch(e){if(closed)return;failure=e.code==='rate-limited'?'rate-limited':'network';phase='error';}finally{clearTimeout(timeout);await save();busy=null;abort=null;emit();}});await busy;return snapshot();
 }
 async function read(){if(latest){prefs.readVersion=latest.version;await save();emit();}return snapshot();}
 async function setAuto(value){if(typeof value==='boolean'){prefs.autoCheck=value;await save();emit();}return snapshot();}
 async function install(){
  if(closed||busy||!canInstall||!latest?.asset||!installer)return snapshot();
  const selected=latest;phase='downloading';failure=null;progress=0;bytes=0;total=selected.asset.size;abort=new AbortController();emit();
  busy=Promise.resolve().then(async()=>{try{await read();await installer(selected,abort.signal,(next,received=0,size=total)=>{phase=next;bytes=received;total=size;progress=size?Math.round(received/size*100):0;emit();});}
   catch(e){if(!closed){phase=abort.signal.aborted?'available':'error';failure=abort.signal.aborted?null:(['checksum','not-writable','prepare','install','unsupported-location','disk-space'].includes(e.code)?e.code:'network');}}
   finally{busy=null;abort=null;emit();}});await busy;return snapshot();
 }
 function cancel(){if(['downloading','preparing'].includes(phase))abort?.abort();}
 function close(){closed=true;if(phase!=='installing')abort?.abort();}
 return {snapshot,check,read,setAuto,install,cancel,close};
}
module.exports={ENDPOINT,REPO,newer,parseRelease,isAllowedURL,requestGitHub,fetchRelease,downloadAsset,createUpdateService,error};
