import test from 'node:test';import assert from 'node:assert/strict';
import desktop from '../desktop-state.cjs';
import {identifyDesktopMix,sameDesktopMix} from '../src/desktop-playback.js';
const {cleanState,cleanCommand}=desktop;
test('mini only forwards existing tone values and explicit rotation booleans',()=>{
 for(const c of [{type:'tone',value:'loud'},{type:'tone',value:null},{type:'rotation',enabled:1},{type:'rotation',enabled:'false'}])assert.equal(cleanCommand(c),null);
 for(const value of ['natural','soft','deep'])assert.deepEqual(cleanCommand({type:'tone',value,path:'private'}),{type:'tone',value});
 assert.deepEqual(cleanCommand({type:'rotation',enabled:false}),{type:'rotation',enabled:false});
 assert.deepEqual(cleanCommand({type:'rotation',enabled:true}),{type:'rotation',enabled:true});
 assert.deepEqual(cleanCommand({type:'rotation-settings',saved:['private']}),{type:'rotation-settings'});
});
test('mini snapshot carries a valid shared state without paths or duplicate playback data',()=>{
 const s=cleanState({playing:false,mixes:[{id:'saved-a',name:'Rain',path:'private'}],currentMixId:'saved-a',tone:'soft',rotationAvailable:true,rotationEnabled:true,rotationStatus:'paused',rotationInterval:10,files:['private'],timer:{secret:true}});
 assert.equal(s.currentMixName,'Rain');assert.equal(s.tone,'soft');assert.equal(s.rotationEnabled,true);assert.equal(s.rotationStatus,'paused');assert.equal(s.playing,false);assert.equal(s.files,undefined);assert.equal(s.timer,undefined);assert.equal(s.mixes[0].path,undefined);
 const bad=cleanState({tone:'other',rotationEnabled:true,rotationAvailable:false,rotationStatus:'playing',currentMixId:'deleted'});assert.equal(bad.tone,'natural');assert.equal(bad.rotationEnabled,false);assert.equal(bad.rotationStatus,'off');assert.equal(bad.currentMixId,'');
});
test('current auto-rotated mix stays in bounded mini list past first hundred saved mixes',()=>{
 const mixes=Array.from({length:1003},(_,i)=>({id:'m'+i,name:'Mix '+i}));const s=cleanState({mixes,currentMixId:'m999'});
 assert.equal(s.mixes.length,103);assert.ok(s.mixes.some(m=>m.id==='m999'));assert.equal(s.currentMixName,'Mix 999');
});
test('current name follows exact mix identity, prefers the rotating saved entry, and clears stale identity',()=>{
 const choices=[{id:'preset-0',name:'Preset',mix:{rain:.5,wind:.2}},{id:'saved-a',name:'Mine',mix:{wind:.2,rain:.5}}];
 assert.equal(identifyDesktopMix({rain:.5,wind:.2},choices,'saved-a').name,'Mine');assert.equal(identifyDesktopMix({rain:.5,wind:.2},choices).id,'preset-0');
 assert.equal(identifyDesktopMix({rain:.6,wind:.2},choices,'saved-a'),null);assert.equal(identifyDesktopMix({rain:.5,wind:.2},[],'saved-a'),null);
 assert.equal(sameDesktopMix({},{}),false);assert.equal(sameDesktopMix({a:NaN},{a:NaN}),false);assert.equal(sameDesktopMix(null,{}),false);
});
