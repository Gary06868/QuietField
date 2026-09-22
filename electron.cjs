const {app,BrowserWindow,Menu,protocol,net,ipcMain,powerSaveBlocker,session,screen,powerMonitor,shell}=require('electron');
const createWindowState=require('./window-state.cjs');
const {applyWindowBounds}=require('./window-geometry.cjs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const publicEdition=require('./dist/edition.json').edition==='public';
app.setName(publicEdition?'QuietField-Public':'QuietField');
if(process.platform==='win32')app.setAppUserModelId(publicEdition?'org.quietfield.desktop.public':'org.quietfield.desktop');
if(process.env.QUIET_FIELD_TEST_DATA)app.setPath('userData',process.env.QUIET_FIELD_TEST_DATA);
protocol.registerSchemesAsPrivileged([{scheme:'quiet',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let win,blocker,companion;
const stopBlock=()=>{if(blocker!==undefined){powerSaveBlocker.stop(blocker);blocker=undefined;}};
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(companion)companion.showMain();else if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
  app.whenReady().then(async()=>{
    const root=path.join(__dirname,'dist');
    protocol.handle('quiet',req=>{
      const url=new URL(req.url);
      if(url.host!=='app')return new Response('Forbidden',{status:403});
      let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{return new Response('Bad path',{status:400});}
      const file=path.resolve(root,'.'+(decoded==='/'?'/index.html':decoded)),rel=path.relative(root,file);
      if(!rel||rel.startsWith('..')||path.isAbsolute(rel))return new Response('Forbidden',{status:403});
      return net.fetch(pathToFileURL(file).toString());
    });
    session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
    Menu.setApplicationMenu(null);
    const windowState=createWindowState(app,screen);
    win=new BrowserWindow({...windowState.initial,frame:false,icon:path.join(root,'icon.ico'),title:'静野 · 留一点安静给自己',backgroundColor:'#060e1a',show:!process.env.QUIET_FIELD_TEST_DATA,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    // On Windows with fractional DPI, constructor sizing includes a small
    // frame conversion offset even when frame:false. Reapply outer bounds once.
    const {x,y,width,height}=windowState.initial;applyWindowBounds(win,{x,y,width,height});
    windowState.attach(win);if(windowState.maximized)win.maximize();
    powerMonitor.on('resume',()=>{if(win&&!win.isDestroyed())win.webContents.send('system-resume');});
    const trusted=event=>win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame;
    ipcMain.handle('window-state',event=>trusted(event)?{maximized:win.isMaximized(),visible:win.isVisible()&&!win.isMinimized()}:null);
    ipcMain.on('window-action',(event,action)=>{
      if(!trusted(event))return;
      if(action==='minimize')win.minimize();
      else if(action==='maximize'){if(win.isMaximized())win.unmaximize();else win.maximize();}
      else if(action==='close')win.close();
    });
    const sendWindowState=()=>win.webContents.send('window-state-changed',{maximized:win.isMaximized(),visible:win.isVisible()&&!win.isMinimized()});
    for(const event of ['maximize','unmaximize','show','hide','minimize','restore'])win.on(event,sendWindowState);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('quiet://app/'))event.preventDefault();});
    ipcMain.on('playback-state',(event,playing)=>{if(event.sender!==win.webContents)return;if(playing===true){if(blocker===undefined)blocker=powerSaveBlocker.start('prevent-app-suspension');}else stopBlock();});
    win.webContents.on('render-process-gone',stopBlock);
    companion=require('./desktop-companion.cjs')(app,win,root);
  win.on('closed',()=>{stopBlock();companion?.dispose();companion=null;win=null;});
    if(publicEdition)await require('./desktop-updates.cjs')({app,win,ipcMain,shell});
    win.loadURL('quiet://app/index.html');
  });
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',stopBlock);
}
