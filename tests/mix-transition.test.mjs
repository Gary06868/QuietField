import test from 'node:test';
import assert from 'node:assert/strict';

// Import the production engine without opening a real browser/user audio database.
globalThis.indexedDB={open:()=>({})};
globalThis.window={desktop:{playing(){}}};
const {AudioEngine,MIX_FADE_SECONDS}=await import('../src/engine.js');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

class Param {
  constructor(value=1){this.value=value;this.events=[];}
  setValueAtTime(value,time){this.events.push({type:'set',value,time});}
  linearRampToValueAtTime(value,time){this.events.push({type:'linear',value,time});}
  setTargetAtTime(value,time,constant){this.events.push({type:'target',value,time,constant});}
  at(time){let value=this.value,previous=0;for(const event of this.events){if(event.type==='linear'&&event.time>time)return value+(event.value-value)*Math.max(0,(time-previous)/(event.time-previous));if(event.time>time)return value;value=event.value;previous=event.time;}return value;}
  cancelScheduledValues(time){this.events=this.events.filter(event=>event.time<time);}
  cancelAndHoldAtTime(time){const value=this.at(time);this.cancelScheduledValues(time);this.setValueAtTime(value,time);}
}
class Node {
  constructor(){this.gain=new Param();this.outputs=new Set();}
  connect(node){this.outputs.add(node);return node;}
  disconnect(node){if(node)this.outputs.delete(node);else this.outputs.clear();}
}
function harness(t){
  t.mock.timers.enable({apis:['setTimeout']});
  const sources=[];
  const ctx={currentTime:0,sampleRate:48000,state:'running',createGain:()=>new Node(),async resume(){this.state='running';},async suspend(){this.state='suspended';},createBufferSource(){const node=new Node();node.starts=0;node.stops=0;node.start=()=>node.starts++;node.stop=()=>node.stops++;sources.push(node);return node;}};
  const engine=new AudioEngine();engine.ctx=ctx;engine.bus=new Node();engine.bus.gain.value=.7;engine.sceneFade=new Node();engine.limiter=new Node();engine.master=new Node();engine.master.gain.value=0;
  engine.bus.connect(engine.sceneFade).connect(engine.limiter);
  engine.load=async sound=>({buffer:{duration:10,id:sound.id},bytes:64});
  const advance=async seconds=>{ctx.currentTime+=seconds;t.mock.timers.tick(Math.ceil(seconds*1000));await flush();};
  const seed=async ids=>{for(const id of ids)await engine.add({id},1);await engine.play();await advance(1);};
  t.after(()=>{engine.cancelMixSwitch();engine.finishMixTransition(true);for(const slot of engine.tracks.values())engine.releaseTrack(slot);});
  return {engine,ctx,sources,advance,seed,live:()=>sources.filter(source=>source.starts&&!source.stops)};
}
const entries=(...ids)=>ids.map(id=>[{id},1]);

test('old mix remains audible until every new sound is ready; failed load preserves it',async t=>{
  const {engine,seed,sources}=harness(t);await seed(['old']);const old=engine.tracks.get('old');
  const wait=deferred();engine.load=async sound=>sound.id==='slow'?wait.promise:{buffer:{id:sound.id,duration:10}};
  const pending=engine.switchMix(entries('ready','slow'));await flush();
  assert.equal(engine.tracks.get('old'),old);assert.equal(old.source.stops,0);assert.equal(sources.length,1);
  wait.reject(new Error('missing local file'));await assert.rejects(pending,/missing local file/);
  assert.equal(engine.tracks.get('old'),old);assert.equal(engine.playing,true);assert.equal(engine.transition,null);assert.equal(engine.preparing.size,0);
});

test('shared sounds keep their source/playhead and complementary envelopes never double the mix',async t=>{
  const {engine,seed,ctx,advance,sources}=harness(t);await seed(['shared','old']);
  const shared=engine.tracks.get('shared').source,oldBus=engine.bus,oldFade=engine.sceneFade;
  assert.equal(await engine.switchMix(entries('shared')),true);const started=ctx.currentTime;
  assert.equal(engine.tracks.get('shared').source,shared);assert.equal(shared.starts,1);assert.equal(sources.length,2);
  for(let step=0;step<=100;step++){
    const at=started+MIX_FADE_SECONDS*step/100;
    const total=2*oldBus.gain.at(at)*oldFade.gain.at(at)+engine.bus.gain.at(at)*engine.sceneFade.gain.at(at);
    assert.ok(total<=.7*Math.sqrt(2)+1e-9);assert.ok(total>=.7-1e-9);
    assert.ok(Math.abs(oldFade.gain.at(at)+engine.sceneFade.gain.at(at)-1)<1e-9);
  }
  await advance(MIX_FADE_SECONDS);assert.equal(shared.stops,0);assert.equal(engine.sourceRefs.get(shared),1);assert.equal(sources[1].stops,1);
});

test('rapid switches coalesce to the latest target with at most two scenes',async t=>{
  const {engine,seed,advance,sources}=harness(t);await seed(['a']);await engine.switchMix(entries('b'));
  const c=engine.switchMix(entries('c'));await flush();const d=engine.switchMix(entries('d'));await flush();
  assert.equal(sources.length,2);assert.deepEqual([...engine.tracks.keys()],['b']);
  await advance(MIX_FADE_SECONDS);assert.equal(await c,false);assert.equal(await d,true);
  assert.deepEqual([...engine.tracks.keys()],['d']);assert.ok(!sources.some(source=>source.buffer.id==='c'));
  await advance(MIX_FADE_SECONDS);assert.equal(engine.sourceRefs.size,1);assert.equal(engine.transition,null);
});

test('8-track destination limit allows only bounded outgoing overlap and frees all outgoing sources',async t=>{
  const {engine,seed,advance,live}=harness(t);await seed(Array.from({length:8},(_,i)=>'a'+i));
  await engine.switchMix(entries(...Array.from({length:8},(_,i)=>'b'+i)));
  assert.equal(engine.tracks.size,8);assert.equal(live().length,16);
  await assert.rejects(engine.switchMix(entries(...Array.from({length:9},(_,i)=>'c'+i))),/8/);
  assert.equal(live().length,16);await advance(MIX_FADE_SECONDS);assert.equal(live().length,8);assert.equal(engine.sourceRefs.size,8);
});

test('pause cancels pending loading without resuming later and keeps the existing short stop',async t=>{
  const {engine,seed,ctx,advance}=harness(t);await seed(['old']);const wait=deferred();engine.load=()=>wait.promise;
  const pending=engine.switchMix(entries('new'));await flush();engine.pause();
  const last=engine.master.gain.events.at(-1);assert.equal(last.value,0);assert.equal(last.time,ctx.currentTime+.2);
  wait.resolve({buffer:{duration:10}});assert.equal(await pending,false);
  await advance(.25);assert.equal(ctx.state,'suspended');assert.equal(engine.playing,false);assert.deepEqual([...engine.tracks.keys()],['old']);
});

test('pausing during overlap releases the outgoing scene and cannot revive a queued mix',async t=>{
  const {engine,seed,advance,live}=harness(t);await seed(['a']);await engine.switchMix(entries('b'));
  const pending=engine.switchMix(entries('c'));await flush();engine.pause();await advance(.25);
  assert.equal(await pending,false);assert.equal(engine.transition,null);assert.equal(live().length,1);assert.deepEqual([...engine.tracks.keys()],['b']);
  await engine.play();assert.deepEqual([...engine.tracks.keys()],['b']);
});

test('selecting a mix while paused does not briefly resume the old mix during loading or failure',async t=>{
  const {engine,seed,advance,ctx}=harness(t);await seed(['old']);engine.pause();await advance(.25);
  const wait=deferred();engine.load=()=>wait.promise;const pending=engine.switchMix(entries('new'));await flush();
  assert.equal(engine.playing,false);assert.equal(ctx.state,'suspended');
  wait.reject(new Error('cannot load'));await assert.rejects(pending,/cannot load/);assert.equal(engine.playing,false);
});

test('sleep keeps the same wall-clock deadline and final 15-second master fade during switching',async t=>{
  const {engine,seed,ctx}=harness(t);await seed(['a']);const deadline=Date.now()+60000;engine.setSleep(deadline);
  await engine.switchMix(entries('b'));assert.equal(engine.sleepAt,deadline);
  const events=engine.master.gain.events,finish=events.at(-1),fadeStart=events.at(-2);
  assert.equal(finish.value,0);assert.ok(Math.abs(finish.time-fadeStart.time-15)<.001);assert.ok(Math.abs(finish.time-ctx.currentTime-60)<.1);
});

test('removing a shared destination track does not stop its outgoing source early',async t=>{
  const {engine,seed,advance}=harness(t);await seed(['shared']);const source=engine.tracks.get('shared').source;
  await engine.switchMix(entries('shared','new'));engine.remove('shared');await advance(.35);assert.equal(source.stops,0);
  await advance(.45);assert.equal(source.stops,1);assert.equal(engine.sourceRefs.size,1);
});

test('preparing buffers and outgoing tracks remain protected from cache eviction',async t=>{
  const {engine,seed}=harness(t);await seed(['a']);await engine.switchMix(entries('b'));
  const wait=deferred();engine.load=()=>wait.promise;const pending=engine.switchMix(entries('c'));await flush();
  for(const id of ['a','b','c','unused'])engine.cache.set(id,{bytes:80*1024*1024});engine.evict();
  assert.deepEqual([...engine.cache.keys()],['a','b','c']);engine.cancelMixSwitch();wait.resolve({buffer:{duration:10}});assert.equal(await pending,false);
});
