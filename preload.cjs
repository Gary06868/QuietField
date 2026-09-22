const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
 updatesState:()=>ipcRenderer.invoke('updates-state'),
 updatesAction:(action,value)=>ipcRenderer.invoke('updates-action',action,value),
 updatesReady:()=>ipcRenderer.send('updates-ready'),
 onUpdatesState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('updates-state',listener);return()=>ipcRenderer.removeListener('updates-state',listener);},
  companionState:()=>ipcRenderer.invoke('companion-state'),
 companionUpdate:value=>ipcRenderer.send('companion-update',value),
 companionAction:value=>{if(['mini','main','tray','pin'].includes(value))ipcRenderer.send('companion-action',value);},
 companionCommand:value=>ipcRenderer.send('companion-command',value),
 onCompanionState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('companion-state',listener);return()=>ipcRenderer.removeListener('companion-state',listener);},
 onCompanionCommand:callback=>{const listener=(_event,command)=>callback(command);ipcRenderer.on('companion-command',listener);return()=>ipcRenderer.removeListener('companion-command',listener);},
 playing:value=>ipcRenderer.send('playback-state',value===true),
  windowAction:action=>{if(['minimize','maximize','close'].includes(action))ipcRenderer.send('window-action',action);},
  windowState:()=>ipcRenderer.invoke('window-state'),
  onResume:callback=>{const listener=()=>callback();ipcRenderer.on('system-resume',listener);return()=>ipcRenderer.removeListener('system-resume',listener);},
  onWindowState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('window-state-changed',listener);return()=>ipcRenderer.removeListener('window-state-changed',listener);}
});
