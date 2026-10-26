import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings} from '../src/settings.js';
const saved=[{id:'a',name:'A',mix:{rain:.5}},{id:'b',name:'B',mix:{wind:.3}},{id:'silent',name:'Silent',mix:{rain:0}}];
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('legacy preferences keep both features off and invalid options cannot inject autoplay or stale IDs',()=>{
  const initial=normalizeSettings({saved});assert.equal(initial.dynamicSoundscape,false);
  assert.deepEqual(initial.rotation,{ids:[],intervalMinutes:5,mode:'sequence'});
  const restored=normalizeSettings({saved,dynamicSoundscape:true,rotation:{enabled:true,ids:['b','a','a','deleted','silent'],intervalMinutes:-1,mode:'invalid'}});
  assert.equal(restored.dynamicSoundscape,true);assert.deepEqual(restored.rotation,{ids:['a','b'],intervalMinutes:5,mode:'sequence'});
  const damaged=normalizeSettings({saved,dynamicSoundscape:'yes',rotation:{ids:'a',intervalMinutes:Infinity,mode:'random'}});
  assert.equal(damaged.dynamicSoundscape,false);assert.deepEqual(damaged.rotation,{ids:[],intervalMinutes:5,mode:'random'});
});

async function harness(t,overrides={}){
  const {MixRotation}=await import('../src/listening-options.js');t.mock.timers.enable({apis:['setTimeout']});
  let playing=true;const applied=[],errors=[];
  const rotation=new MixRotation({apply:async id=>{applied.push(id);return true;},canRun:()=>playing,cancelApply(){},onError:error=>errors.push(error.message),...overrides});
  const configure=(value={})=>rotation.configure({enabled:true,ids:['a','b','c'],intervalMinutes:1,mode:'sequence',...value},['a','b','c']);
  const advance=async ms=>{t.mock.timers.tick(ms);await flush();};t.after(()=>rotation.dispose());
  return {rotation,applied,errors,configure,advance,setPlaying:value=>{playing=value;}};
}

test('rotation waits an entire interval and advances in list order after a noted current mix',async t=>{
  const h=await harness(t);h.rotation.noteCurrent('a');h.configure();assert.deepEqual(h.applied,[]);
  await h.advance(59999);assert.deepEqual(h.applied,[]);await h.advance(1);assert.deepEqual(h.applied,['b']);
  await h.advance(60000);assert.deepEqual(h.applied,['b','c']);await h.advance(60000);assert.deepEqual(h.applied,['b','c','a']);
});

test('random rotation excludes the current mix even when random chooses its first candidate',async t=>{
  const h=await harness(t,{random:()=>0});h.configure({mode:'random'});h.rotation.noteCurrent('a');
  await h.advance(60000);await h.advance(60000);assert.deepEqual(h.applied,['b','a']);
});

test('paused enablement never applies; explicit playback starts a fresh interval',async t=>{
  const h=await harness(t);h.setPlaying(false);h.configure();await h.advance(600000);assert.deepEqual(h.applied,[]);
  h.setPlaying(true);h.rotation.playbackChanged();await h.advance(59999);assert.deepEqual(h.applied,[]);await h.advance(1);assert.deepEqual(h.applied,['a']);
  h.setPlaying(false);h.rotation.playbackChanged();await h.advance(600000);assert.deepEqual(h.applied,['a']);
});

test('pause invalidates pending work and a late resolution cannot rearm rotation',async t=>{
  const wait=deferred();let canceled=0,calls=0;const h=await harness(t,{apply:()=>{calls++;return wait.promise;},cancelApply:()=>canceled++});
  h.configure();await h.advance(60000);assert.equal(calls,1);h.setPlaying(false);h.rotation.playbackChanged();assert.equal(canceled,1);
  wait.resolve(true);await flush();await h.advance(600000);assert.equal(calls,1);
});

test('manual stop cancels queued rotation and reconfiguration never accumulates timers',async t=>{
  const h=await harness(t);h.configure();await h.advance(30000);h.configure();await h.advance(30000);assert.deepEqual(h.applied,[]);
  await h.advance(30000);assert.deepEqual(h.applied,['a']);h.rotation.stop();await h.advance(600000);assert.deepEqual(h.applied,['a']);
});

test('deleting selected mixes prunes requests and stops when fewer than two remain',async t=>{
  const h=await harness(t);h.configure();h.rotation.configure({enabled:true,ids:['a','b','c'],intervalMinutes:1,mode:'sequence'},['a','c']);
  h.rotation.noteCurrent('a');await h.advance(60000);assert.deepEqual(h.applied,['c']);
  h.rotation.configure({enabled:true,ids:['a','b','c'],intervalMinutes:1,mode:'sequence'},['c']);await h.advance(600000);assert.deepEqual(h.applied,['c']);
});

test('a failed load stops rotation with one error and no retries behind the current mix',async t=>{
  let calls=0;const h=await harness(t,{apply:async()=>{calls++;throw new Error('cannot decode');}});h.configure();
  await h.advance(60000);assert.deepEqual(h.errors,['cannot decode']);await h.advance(600000);assert.equal(calls,1);
});

test('sleep eligibility at callback time wins over an already queued timeout',async t=>{
  let sleepFade=false;const h=await harness(t,{canRun:()=>!sleepFade});h.configure();sleepFade=true;
  await h.advance(60000);assert.deepEqual(h.applied,[]);await h.advance(600000);assert.deepEqual(h.applied,[]);
});

test('one slow switch cannot cause overlapping timer requests',async t=>{
  const wait=deferred();let calls=0;const h=await harness(t,{apply:()=>{calls++;return wait.promise;}});h.configure();
  await h.advance(60000);await h.advance(600000);assert.equal(calls,1);wait.resolve(true);await flush();await h.advance(59999);assert.equal(calls,1);
});
test('deletion while loading cancels the request and stale failure cannot stop a newer rotation',async t=>{
  const wait=deferred();let canceled=0,calls=0;
  const h=await harness(t,{apply:async()=>{calls++;return calls===1?wait.promise:true;},cancelApply:()=>canceled++});
  h.configure();await h.advance(60000);h.rotation.configure({enabled:true,ids:['a','b','c'],intervalMinutes:1,mode:'sequence'},['b','c']);
  assert.equal(canceled,1);wait.reject(new Error('stale missing mix'));await flush();assert.deepEqual(h.errors,[]);
  await h.advance(60000);assert.equal(calls,2);
});
