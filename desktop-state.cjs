const text=value=>typeof value==='string'?value.slice(0,120):'';
function cleanState(value={}) {
 const v=value&&typeof value==='object'?value:{};
 return {locale:v.locale==='en'?'en':'zh-CN',playing:v.playing===true,ready:v.ready===true,
 master:typeof v.master==='number'&&Number.isFinite(v.master)?Math.max(0,Math.min(1,v.master)):.5,
 activeCount:Number.isInteger(v.activeCount)?Math.max(0,Math.min(8,v.activeCount)):0,
 label:text(v.label),sleepLabel:text(v.sleepLabel),loading:v.loading===true,
 mixes:(Array.isArray(v.mixes)?v.mixes:[]).filter(m=>m&&typeof m.id==='string'&&typeof m.name==='string').slice(0,103).map(m=>({id:text(m.id),name:text(m.name)}))};
}
function cleanCommand(v) {
 if(!v||typeof v!=='object')return null;
 if(v.type==='toggle')return {type:'toggle'};
 if(v.type==='master'&&typeof v.value==='number'&&Number.isFinite(v.value))return {type:'master',value:Math.max(0,Math.min(1,v.value))};
 if(v.type==='mix'&&typeof v.id==='string'&&v.id.length<=120)return {type:'mix',id:v.id};
 return null;
}
module.exports={cleanState,cleanCommand};
