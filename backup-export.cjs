const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
module.exports=({ipcMain,dialog,app,win,trusted})=>{
 ipcMain.handle('export-backup',async(event,text,locale)=>{
  if(!trusted(event)||typeof text!=='string'||Buffer.byteLength(text,'utf8')>2*1024*1024)return {error:'invalid'};
  let data;try{data=JSON.parse(text);}catch{return {error:'invalid'};}
  if(data?.format!=='quiet-field-backup'||data.version!==1||!Array.isArray(data.saved)||!Array.isArray(data.favorites))return {error:'invalid'};
  let temp;try{const chosen=await dialog.showSaveDialog(win,{title:locale==='en'?'Export Quiet Field backup':'导出静野备份',defaultPath:path.join(app.getPath('documents'),'quiet-field-backup-'+new Date().toISOString().slice(0,10)+'.json'),filters:[{name:'JSON',extensions:['json']}],properties:['showOverwriteConfirmation']});if(chosen.canceled||!chosen.filePath)return {canceled:true};temp=path.join(path.dirname(chosen.filePath),'.quiet-field-backup-'+randomUUID()+'.tmp');await fs.writeFile(temp,text,{encoding:'utf8',flag:'wx'});await fs.rename(temp,chosen.filePath);return {saved:true};}catch{if(temp)await fs.unlink(temp).catch(()=>{});return {error:'write'};}
 });
};
