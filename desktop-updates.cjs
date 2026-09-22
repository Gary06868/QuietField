const fs=require('node:fs/promises');const path=require('node:path');const {spawn}=require('node:child_process');const {randomUUID}=require('node:crypto');
const {createUpdateService,downloadAsset,error}=require('./updates.cjs');
const within=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&!rel.startsWith('..')&&!path.isAbsolute(rel);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function runPrepare(worker,configPath,signal){
 await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',worker,'-Mode','Prepare','-ConfigPath',configPath],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';const abort=()=>child.kill();signal.addEventListener('abort',abort,{once:true});child.stdout.on('data',b=>{if(output.length<8192)output+=b;});child.stderr.on('data',b=>{if(output.length<8192)output+=b;});child.once('error',()=>reject(error('prepare')));child.once('close',code=>{signal.removeEventListener('abort',abort);if(code===0&&!signal.aborted)resolve();else reject(error('prepare'));});if(signal.aborted)abort();});
}
async function startApply(worker,config,configPath){
 // A detached Windows PowerShell 5.1 host can exit 0 without running the helper.
 // Launch keeps a handle to an independent hidden Apply process until it exits.
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',worker,'-Mode','Launch','-ConfigPath',configPath],{cwd:config.jobDir,windowsHide:true,stdio:'ignore'});let launchError=false;child.once('error',()=>{launchError=true;});
 const stopped=()=>launchError||child.exitCode!==null||child.signalCode!==null;
 for(let i=0;i<3000;i++){
  if(stopped())throw error('install');
  let marker;try{marker=JSON.parse(await fs.readFile(config.readyPath,'utf8'));}catch{}
  if(marker?.ready===true&&marker.ticket===config.ticket){
   // A helper can time out while the main process is suspended or blocked. Its
   // old ready marker must not cause this app to quit after the helper has died.
   const finished=await fs.access(config.resultPath).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw error('install');});
   if(finished||stopped())throw error('install');
   child.unref();return;
  }
  if(stopped())throw error('install');
  await sleep(100);
 }
 child.kill();throw error('install');
}
async function acknowledge(app){
 const argument=process.argv.find(a=>a.startsWith('--quiet-field-update-ticket='));if(!argument)return;
 try{const configPath=path.resolve(argument.slice('--quiet-field-update-ticket='.length)),root=path.join(app.getPath('userData'),'updates');if(!within(root,configPath))return;const config=JSON.parse(await fs.readFile(configPath,'utf8'));const job=await fs.realpath(path.dirname(configPath));if(!within(await fs.realpath(root),job)||path.resolve(config.jobDir)!==job||path.resolve(config.ackPath)!==path.join(job,'ack.json')||config.version!==app.getVersion()||!/^[-a-f0-9]{36}$/.test(config.ticket))return;
 const actual=await fs.realpath(path.dirname(process.execPath));if(actual.toLowerCase()!==String(config.targetDir).toLowerCase())return;
 await fs.writeFile(config.ackPath,JSON.stringify({ticket:config.ticket,version:app.getVersion(),pid:process.pid}));
 }catch{}
}
module.exports=async function createDesktopUpdates({app,win,ipcMain,shell}){
 const root=path.join(app.getPath('userData'),'updates'),prefsPath=path.join(app.getPath('userData'),'update-settings.json');
 const trusted=event=>!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame;
 const send=state=>{if(!win.isDestroyed())win.webContents.send('updates-state',state);};
 const supported=app.isPackaged&&process.platform==='win32'&&process.arch==='x64';
 async function install(release,signal,progress){
  if(!supported)throw error('unsupported-location');
  const targetDir=await fs.realpath(path.dirname(process.execPath)),parent=path.dirname(targetDir);
  const blocked=[path.parse(targetDir).root,...['home','desktop','documents','downloads','temp','appData','userData'].map(key=>app.getPath(key))];
  if(blocked.some(dir=>path.resolve(dir).toLowerCase()===targetDir.toLowerCase())||parent===targetDir)throw error('unsupported-location');
  const old=JSON.parse(await fs.readFile(path.join(targetDir,'resources/app/package.json'),'utf8')),edition=JSON.parse(await fs.readFile(path.join(targetDir,'resources/app/dist/edition.json'),'utf8'));
  if(old.name!=='quiet-field'||old.version!==app.getVersion()||edition.edition!=='public')throw error('unsupported-location');
  const ticket=randomUUID(),jobDir=path.join(root,ticket);await fs.mkdir(jobDir,{recursive:true});
  const stageDir=path.join(parent,'.quiet-field-stage-'+ticket),backupDir=path.join(parent,'.quiet-field-backup-'+app.getVersion()+'-'+ticket);
  const probe=path.join(parent,'.quiet-field-write-'+ticket);try{await fs.writeFile(probe,'',{flag:'wx'});await fs.unlink(probe);}catch{throw error('not-writable');}
  for(const directory of [parent,root]){try{const stat=await fs.statfs(directory);if(Number(stat.bavail)*Number(stat.bsize)<release.asset.size*3+256*1024**2)throw error('disk-space');}catch(e){if(e.code==='disk-space')throw e;}}
  const config={zipPath:path.join(jobDir,'update.zip'),stageDir,targetDir,backupDir,currentVersion:app.getVersion(),version:release.version,sha256:release.asset.sha256,pid:process.pid,jobDir,ticket,readyPath:path.join(jobDir,'ready.json'),ackPath:path.join(jobDir,'ack.json'),resultPath:path.join(jobDir,'result.json')};
  const configPath=path.join(jobDir,'config.json'),worker=path.join(jobDir,'update-worker.ps1');await fs.writeFile(configPath,JSON.stringify(config));await fs.copyFile(path.join(__dirname,'update-worker.ps1'),worker);
  await downloadAsset(release.asset,config.zipPath,signal,(received,total)=>progress('downloading',received,total));signal.throwIfAborted();progress('preparing',release.asset.size,release.asset.size);
  await runPrepare(worker,configPath,signal);signal.throwIfAborted();progress('installing',release.asset.size,release.asset.size);await startApply(worker,config,configPath);app.quit();
 }
 const service=await createUpdateService({version:app.getVersion(),prefsPath,installer:install,canInstall:supported,notify:send});
 ipcMain.handle('updates-state',event=>trusted(event)?service.snapshot():null);
 ipcMain.handle('updates-action',async(event,action,value)=>{if(!trusted(event))return null;switch(action){case 'check':return service.check(true);case 'read':return service.read();case 'auto':return service.setAuto(value);case 'install':return service.install();case 'cancel':service.cancel();return service.snapshot();case 'release':{const latest=service.snapshot().latest;if(latest)await shell.openExternal(latest.url);return service.snapshot();}default:return service.snapshot();}});
 const ready=event=>{if(trusted(event))acknowledge(app);};ipcMain.on('updates-ready',ready);
 // Native tests and development runs never make unsolicited network requests.
 const automatic=app.isPackaged&&!process.env.QUIET_FIELD_TEST_DATA;
 const timer=automatic?setTimeout(()=>service.check(),12000):null,interval=automatic?setInterval(()=>service.check(),3600000):null;
 const dispose=()=>{clearTimeout(timer);clearInterval(interval);service.close();ipcMain.removeHandler('updates-state');ipcMain.removeHandler('updates-action');ipcMain.removeListener('updates-ready',ready);};
 app.once('before-quit',dispose);return {dispose,snapshot:service.snapshot};
};
