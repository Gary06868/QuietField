import {parseSettings} from './settings.js';
const ready = new Promise((resolve,reject)=>{
  const req=indexedDB.open('quiet-field-audio',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'id'});
  req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
});
export async function files(action,value) {
  const db=await ready;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('files',action==='getAll'||action==='get'?'readonly':'readwrite');
    const req=tx.objectStore('files')[action](value);
    tx.oncomplete=()=>resolve(req.result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
  });
}
export function readSettings() {
  try {return parseSettings(localStorage.getItem('quiet-field-settings'));} catch {return parseSettings(null);}
}
