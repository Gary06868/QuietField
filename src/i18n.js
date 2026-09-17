import english from './locales/en.json' with {type:'json'};
export function resolveLocale(saved, languages=[]) {
  if(saved==='en'||saved==='zh-CN')return saved;
  const preferred=Array.isArray(languages)?languages[0]:languages;
  return /^zh(?:-|$)/i.test(preferred||'')?'zh-CN':'en';
}
export function translate(locale,key,params={}) {
  const text=locale==='en'?(english[key]??key):key;
  return String(text).replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(params,name)?String(params[name]):match);
}
export function soundName(sound,locale){return sound.custom?sound.name:translate(locale,sound.name);}
export function matchesSound(sound,query){return `${sound.name} ${soundName(sound,'en')} ${sound.category} ${translate('en',sound.category)} ${sound.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());}
export {english};
