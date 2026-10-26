import {normalizeSettings,validSettingId,MAX_SAVED_MIXES,MAX_FAVORITES} from './settings.js';
export const BACKUP_LIMIT=2*1024*1024;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=()=>{throw Error('备份格式无效，原有数据未改动');};
export function exportBackup(settings){
 const s=normalizeSettings(settings);
 return JSON.stringify({format:'quiet-field-backup',version:1,createdAt:new Date().toISOString(),audioIncluded:false,saved:s.saved,favorites:s.favorites},null,2);
}
export function parseBackup(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>BACKUP_LIMIT)throw Error('备份不能超过 2 MB');
 let v;try{v=JSON.parse(raw);}catch{fail();}
 if(!plain(v)||v.format!=='quiet-field-backup'||v.version!==1||!Array.isArray(v.saved)||!Array.isArray(v.favorites)||v.saved.length>MAX_SAVED_MIXES||v.favorites.length>MAX_FAVORITES)fail();
 const seen=new Set();
 for(const p of v.saved){
  if(!plain(p)||!validSettingId(p.id)||seen.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||!plain(p.mix)||Object.keys(p.mix).length>8)fail();seen.add(p.id);
  for(const [id,gain] of Object.entries(p.mix))if(!validSettingId(id)||typeof gain!=='number'||!Number.isFinite(gain)||gain<0||gain>3)fail();
 }
 if(v.favorites.some(id=>!validSettingId(id)))fail();
 return {saved:v.saved.map(p=>({id:p.id,name:p.name.trim(),mix:{...p.mix}})),favorites:[...new Set(v.favorites)]};
}
const signature=p=>JSON.stringify([p.name,Object.entries(p.mix).sort(([a],[b])=>a.localeCompare(b))]);
export function mergeBackup(current,incoming,{makeId=()=>crypto.randomUUID(),reserve=0}={}){
 const saved=current.saved.map(p=>({...p,mix:{...p.mix}})),map=new Map(saved.map(p=>[p.id,p]));let added=0,skipped=0,conflicts=0;
 for(const p of incoming.saved){
  const old=map.get(p.id);if(old&&(signature(old)===signature(p)||saved.some(existing=>signature(existing)===signature(p)))){skipped++;continue;}
  let id=p.id;
  if(old){conflicts++;let tries=0;do{id='copy-'+makeId();if(++tries>20)throw Error('无法生成组合编号，请重试');}while(map.has(id));}
  const next={id,name:p.name,mix:{...p.mix}};saved.push(next);map.set(id,next);added++;
 }
 if(saved.length+reserve>MAX_SAVED_MIXES)throw Error('组合上限为 1000，导入前请先整理');
 const favorites=[...new Set([...current.favorites,...incoming.favorites])];if(favorites.length>MAX_FAVORITES)throw Error('收藏数量超过备份上限');
 return {saved,favorites,added,skipped,conflicts};
}
export function commitBackup(storage,current,incoming,options){
 const result=mergeBackup(current,incoming,options);storage.setItem('quiet-field-settings',JSON.stringify({...current,saved:result.saved,favorites:result.favorites}));return result;
}
