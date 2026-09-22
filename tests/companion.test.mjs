import test from 'node:test';import assert from 'node:assert/strict';
import desktop from '../desktop-state.cjs';
import {normalizeSettings} from '../src/settings.js';
const {cleanState,cleanCommand}=desktop;
test('desktop controls reject malformed actions and bound gain before forwarding',()=>{
 for(const value of [null,{},'toggle',{type:'master',value:NaN},{type:'master',value:'1'},{type:'quit'},{type:'mix',id:'x'.repeat(121)}])assert.equal(cleanCommand(value),null);
 assert.deepEqual(cleanCommand({type:'master',value:4}),{type:'master',value:1});
 assert.deepEqual(cleanCommand({type:'master',value:-2}),{type:'master',value:0});
 assert.deepEqual(cleanCommand({type:'mix',id:'saved-123',mix:{private:'ignored'}}),{type:'mix',id:'saved-123'});
});
test('companion snapshot excludes local files and tolerates damaged renderer data',()=>{
 const s=cleanState({locale:'bad',playing:1,master:Infinity,activeCount:99,mixes:[null,{id:'a',name:'My mix',path:'private.wav'}],files:['secret.wav'],label:'x'.repeat(300)});
 assert.equal(s.locale,'zh-CN');assert.equal(s.playing,false);assert.equal(s.master,.5);assert.equal(s.activeCount,8);assert.equal(s.label.length,120);assert.deepEqual(s.mixes,[{id:'a',name:'My mix'}]);assert.equal(s.files,undefined);assert.equal(cleanState(null).ready,false);
});
test('background migration keeps saved mixes and imports separate from appearance preferences',()=>{
 const before={mix:{rain:2.3},saved:[{id:'one',name:'我的雨夜',mix:{rain:2.3}}],favorites:['rain']};
 for(const v of [null,'unknown',{},'forest']){const s=normalizeSettings({...before,backgroundId:v,animateBackground:false});assert.equal(s.backgroundId,v==='forest'?'forest':'alpine');assert.equal(s.animateBackground,false);assert.deepEqual(s.mix,before.mix);assert.deepEqual(s.saved,before.saved);}
 assert.equal(normalizeSettings(before).animateBackground,true);
});
