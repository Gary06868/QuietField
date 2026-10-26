export function sameDesktopMix(a,b){
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)||Array.isArray(b))return false;
 const keys=Object.keys(a),other=Object.keys(b);
 return keys.length>0&&keys.length===other.length&&keys.every(id=>Number.isFinite(a[id])&&a[id]===b[id]);
}
// Display an exact match, never a stale name after manual edits or deletion.
export function identifyDesktopMix(mix,choices,preferredId){
 const preferred=choices.find(p=>p.id===preferredId&&sameDesktopMix(mix,p.mix));
 const match=preferred||choices.find(p=>sameDesktopMix(mix,p.mix));
 return match?{id:match.id,name:match.name}:null;
}
