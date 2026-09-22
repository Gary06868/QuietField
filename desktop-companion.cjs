const {BrowserWindow,Tray,Menu,nativeImage,ipcMain,screen}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const {cleanState,cleanCommand}=require('./desktop-state.cjs');
module.exports=function createCompanion(app,main,root){
 let mini=null,tray=null,quitting=false,state=cleanState(),lastMenu='',pinned=false,mode='main',miniReady=false;
 const prefsPath=path.join(app.getPath('userData'),'desktop-prefs.json');
 try{pinned=JSON.parse(fs.readFileSync(prefsPath,'utf8')).pinned===true;}catch{}
 const valid=(event,window)=>window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame;
 const trusted=event=>valid(event,main)||valid(event,mini);
 const snapshot=()=>({...state,pinned,trayAvailable:!!tray});
 const broadcast=()=>{if(mini&&!mini.isDestroyed())mini.webContents.send('companion-state',snapshot());};
 const showMain=()=>{if(quitting||main.isDestroyed())return;mode='main';if(mini&&!mini.isDestroyed())mini.hide();if(main.isMinimized())main.restore();main.show();main.focus();};
 const command=value=>{const c=cleanCommand(value);if(!c||!state.ready||main.isDestroyed())return;if(c.type==='mix'&&!state.mixes.some(m=>m.id===c.id))return;main.webContents.send('companion-command',c);};
 const hideToTray=()=>{if(!tray)return;mode='tray';main.hide();mini?.hide();};
 function showMini(){
  if(quitting||main.isDestroyed())return;mode='mini';
  if(mini&&!mini.isDestroyed()){if(miniReady){mini.show();mini.focus();main.hide();}return;}
  const area=screen.getDisplayMatching(main.getBounds()).workArea;
  mini=new BrowserWindow({width:360,height:246,x:Math.max(area.x,area.x+area.width-384),y:Math.max(area.y,area.y+area.height-270),frame:false,resizable:false,maximizable:false,fullscreenable:false,alwaysOnTop:pinned,show:false,icon:path.join(root,'icon.ico'),title:'Quiet Field · Mini',backgroundColor:'#081524',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  mini.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mini.webContents.on('will-navigate',(event,url)=>{if(url!=='quiet://app/index.html#mini')event.preventDefault();});
  const created=mini;miniReady=false;
  mini.once('ready-to-show',()=>{if(mini!==created||created.isDestroyed())return;miniReady=true;if(!quitting&&mode==='mini'){created.show();main.hide();broadcast();}});
  mini.on('close',event=>{if(!quitting){event.preventDefault();showMain();}});
  mini.on('closed',()=>{mini=null;});
  mini.webContents.on('render-process-gone',()=>{showMain();mini?.destroy();});
  mini.loadURL('quiet://app/index.html#mini');
 }
 function updateMenu(){
  if(!tray)return;
  const key=JSON.stringify([state.locale,state.playing,state.ready,state.master,state.mixes]);if(key===lastMenu)return;lastMenu=key;
  const en=state.locale==='en',t=(zh,enText)=>en?enText:zh;
  tray.setToolTip(t('静野','Quiet Field')+' · '+(state.playing?t('正在播放','Playing'):t('已暂停','Paused')));
  tray.setContextMenu(Menu.buildFromTemplate([
   {label:t('打开静野','Open Quiet Field'),click:showMain},
   {label:t('迷你播放器','Mini player'),click:showMini},
   {label:t('留在托盘播放','Keep in tray'),click:hideToTray},
   {type:'separator'},
   {label:state.playing?t('暂停','Pause'):t('播放','Play'),enabled:state.ready,click:()=>command({type:'toggle'})},
   {label:t('总音量','Volume'),submenu:[0,.25,.5,.75,1].map(value=>({label:Math.round(value*100)+'%',type:'radio',checked:Math.abs(state.master-value)<.001,click:()=>command({type:'master',value})}))},
   {label:t('声音组合','Sound mixes'),enabled:state.mixes.length>0,submenu:state.mixes.map(m=>({label:m.name.replaceAll('&','&&'),click:()=>command({type:'mix',id:m.id})}))},
   {type:'separator'},
   {label:t('退出静野','Quit Quiet Field'),click:()=>app.quit()}
  ]));
 }
 try{const icon=process.platform==='win32'?path.join(root,'icon.ico'):nativeImage.createFromPath(path.join(root,'icon.png')).resize({width:20,height:20});tray=new Tray(icon);tray.on('click',showMain);updateMenu();}catch(error){console.warn('Tray unavailable:',error.message);}
 const update=(event,value)=>{if(!valid(event,main))return;state=cleanState(value);broadcast();updateMenu();};
 const action=(event,value)=>{if(!trusted(event)||typeof value!=='string')return;
  if(value==='mini')showMini();else if(value==='main')showMain();else if(value==='tray')hideToTray();
  else if(value==='pin'){pinned=!pinned;mini?.setAlwaysOnTop(pinned);try{fs.writeFileSync(prefsPath,JSON.stringify({pinned}));}catch{}broadcast();}
 };
 const receive=(event,value)=>{if(trusted(event))command(value);};
 ipcMain.on('companion-update',update);ipcMain.on('companion-action',action);ipcMain.on('companion-command',receive);
 ipcMain.handle('companion-state',event=>trusted(event)?snapshot():null);
 const beforeQuit=()=>{quitting=true;};app.on('before-quit',beforeQuit);
 const crashed=()=>{state={...state,ready:false,playing:false};broadcast();updateMenu();showMain();};main.webContents.on('render-process-gone',crashed);
 const unloaded=()=>{state={...state,ready:false,playing:false};broadcast();updateMenu();};main.webContents.on('did-start-loading',unloaded);
 return {showMain,dispose(){quitting=true;mini?.destroy();mini=null;tray?.destroy();tray=null;ipcMain.removeListener('companion-update',update);ipcMain.removeListener('companion-action',action);ipcMain.removeListener('companion-command',receive);ipcMain.removeHandler('companion-state');app.removeListener('before-quit',beforeQuit);}};
};
