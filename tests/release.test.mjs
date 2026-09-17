import test from 'node:test';import assert from 'node:assert/strict';
import {parseSettings,normalizeSettings} from '../src/settings.js';
import geometry from '../window-geometry.cjs';
import {SerialQueue,makeRoom,MiB} from '../src/audio-budget.js';
test('audio queue serializes decodes and recovers after a rejected job',async()=>{
 const queue=new SerialQueue(),events=[];const a=queue.run(async()=>{events.push('a');await new Promise(r=>setTimeout(r,10));events.push('b');throw Error('bad');});const b=queue.run(()=>events.push('c'));await assert.rejects(a);await b;assert.deepEqual(events,['a','b','c']);
});
test('memory admission evicts inactive cache, protects active buffers, rejects oversize',()=>{
 const c=new Map([['idle',{bytes:50*MiB}],['playing',{bytes:100*MiB}]]),a=new Map([['playing',{}]]);makeRoom(c,a,60*MiB,192*MiB);assert.equal(c.has('idle'),false);assert.equal(c.has('playing'),true);assert.throws(()=>makeRoom(c,a,120*MiB,192*MiB));assert.throws(()=>makeRoom(c,a,129*MiB,384*MiB));
});
test('corrupt or non-object settings safely recover without losing the import store',()=>{
 for(const raw of ['null','[]','42','true','"hi"','{','']){const s=parseSettings(raw);assert.equal(s.master,.5);assert.deepEqual(s.saved,[]);assert.deepEqual(s.mix,{});}
});
test('legacy preferences migrate, malformed mixes are removed, boosted gains survive',()=>{
 const s=normalizeSettings({master:2,mix:{rain:2.5,bad:'3',nan:NaN},favorites:['rain',null,'rain'],saved:[null,{id:'ok',name:' 雨夜 ',mix:{rain:3}},{id:'bad',name:'bad',mix:null},{id:'ok',name:'duplicate',mix:{}}]});
 assert.equal(s.version,2);assert.equal(s.master,1);assert.deepEqual(s.mix,{rain:2.5});assert.deepEqual(s.favorites,['rain']);assert.equal(s.saved.length,1);assert.equal(s.saved[0].name,'雨夜');assert.equal(s.saved[0].mix.rain,3);
});
test('window fits physical-resolution / DPI combinations including short workspaces',()=>{
 for(const [w,h] of [[1366,768],[1920,1080],[3840,2160]])for(const scale of [1,1.25,1.5,2,2.25]){
 const work={x:0,y:0,width:Math.floor(w/scale),height:Math.floor(h/scale)-48};const r=geometry.fitWindow({x:5000,y:-900,width:1440,height:960},work);
 assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=work.width+1&&r.y+r.height<=work.height+1);assert.ok(r.minHeight<=work.height);}
});
test('negative-coordinate monitor placement preserved, unplugged display falls back visibly',()=>{
 const primary={workArea:{x:0,y:0,width:1280,height:700}},left={workArea:{x:-1920,y:0,width:1920,height:1040}};
 const saved={x:-1800,y:50,width:1000,height:700};assert.equal(geometry.chooseDisplay(saved,[primary,left],primary),left);
 assert.equal(geometry.chooseDisplay(saved,[primary],primary),primary);const r=geometry.fitWindow(saved,primary.workArea);assert.ok(r.x>=0&&r.width<=1280);
});
