const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  playing:value=>ipcRenderer.send('playback-state',value===true),
  windowAction:action=>{if(['minimize','maximize','close'].includes(action))ipcRenderer.send('window-action',action);},
  windowState:()=>ipcRenderer.invoke('window-state'),
  onResume:callback=>{const listener=()=>callback();ipcRenderer.on('system-resume',listener);return()=>ipcRenderer.removeListener('system-resume',listener);},
  onWindowState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('window-state-changed',listener);return()=>ipcRenderer.removeListener('window-state-changed',listener);}
});
