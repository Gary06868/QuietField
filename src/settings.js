import {validateBackground} from './backgrounds.js';
import {trackVolume,masterVolume} from './loudness.js';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=180&&!['__proto__','constructor','prototype'].includes(id);
export function cleanMix(value){
  if(!object(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([id,v])=>validId(id)&&typeof v==='number'&&Number.isFinite(v)).slice(0,8).map(([id,v])=>[id,trackVolume(v)]));
}
export function normalizeSettings(value){
  const v=object(value)?value:{};
  const seen=new Set();
  const saved=(Array.isArray(v.saved)?v.saved:[]).filter(p=>object(p)&&validId(p.id)&&typeof p.name==='string'&&p.name.trim()&&object(p.mix)).slice(0,100).flatMap(p=>{
    if(seen.has(p.id))return [];seen.add(p.id);
    return [{id:p.id,name:p.name.trim().slice(0,80),mix:cleanMix(p.mix)}];
  });
  return {version:2,locale:['en','zh-CN'].includes(v.locale)?v.locale:null,master:typeof v.master==='number'&&Number.isFinite(v.master)?masterVolume(v.master):.5,mix:cleanMix(v.mix),favorites:[...new Set((Array.isArray(v.favorites)?v.favorites:[]).filter(validId))].slice(0,500),saved,backgroundId:validateBackground(v.backgroundId),animateBackground:v.animateBackground!==false,reducedEffects:v.reducedEffects===true};
}
export function parseSettings(raw){try{return normalizeSettings(JSON.parse(raw||'{}'));}catch{return normalizeSettings({});}}
