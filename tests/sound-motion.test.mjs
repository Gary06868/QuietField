import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.indexedDB={open:()=>({})};globalThis.window={desktop:{playing(){}}};
const {AudioEngine}=await import('../src/engine.js');
class Param{constructor(value=1){this.value=value;this.events=[];}setValueAtTime(value,time){this.events.push({value,time});}linearRampToValueAtTime(value,time){this.events.push({value,time});}setTargetAtTime(value,time){this.events.push({value,time});}cancelAndHoldAtTime(){}cancelScheduledValues(){}}
class Node{constructor(){this.gain=new Param();this.frequency=new Param();this.outputs=new Set();this.starts=0;this.stops=0;}connect(node){this.outputs.add(node);return node;}disconnect(node){if(node)this.outputs.delete(node);else this.outputs.clear();}start(){this.starts++;}stop(){this.stops++;}}
function harness(t){
  t.mock.timers.enable({apis:['setTimeout']});const sources=[],oscillators=[];
  const ctx={currentTime:1,state:'running',createGain:()=>new Node(),createBufferSource(){const s=new Node();sources.push(s);return s;},createOscillator(){const s=new Node();oscillators.push(s);return s;},async resume(){this.state='running';},async suspend(){this.state='suspended';}};
  const engine=new AudioEngine();Object.assign(engine,{ctx,bus:new Node(),sceneFade:new Node(),limiter:new Node(),master:new Node()});engine.load=async()=>({buffer:{duration:20},bytes:64});
  t.after(()=>{engine.cancelMixSwitch();engine.finishMixTransition(true);for(const slot of engine.tracks.values())engine.releaseTrack(slot);});return {engine,ctx,sources,oscillators};
}
test('motion is off by default and uses a separate bounded gain without rewriting user volumes',async t=>{
  const h=harness(t);await h.engine.add({id:'rain'},.5);const track=h.engine.tracks.get('rain');assert.equal(h.oscillators.length,0);
  assert.equal(typeof h.engine.setDynamic,'function');h.engine.setDynamic(true);assert.equal(h.oscillators.length,1);
  const motion=h.engine.motions.get(track.source);assert.equal(motion.gain.gain.events.at(-1).value,.94);assert.equal(motion.depth.gain.events.at(-1).value,.06);
  assert.ok(h.oscillators[0].frequency.value>=1/90&&h.oscillators[0].frequency.value<=1/45);
  h.engine.volume('rain',.7);assert.equal(track.volume,.7);assert.equal(track.gain.gain.events.at(-1).value,.7);
  h.engine.volume('rain',0);assert.equal(track.gain.gain.events.at(-1).value,0);assert.equal(motion.gain.gain.events.at(-1).value,.94);
  h.engine.setDynamic(false);assert.equal(motion.gain.gain.events.at(-1).value,1);assert.equal(motion.depth.gain.events.at(-1).value,0);
});
test('shared mix sources keep one motion path and outgoing motion resources release with their source',async t=>{
  const h=harness(t);assert.equal(typeof h.engine.setDynamic,'function');h.engine.setDynamic(true);
  await h.engine.add({id:'shared'},.5);await h.engine.add({id:'old'},.2);await h.engine.play();const source=h.engine.tracks.get('shared').source;
  const motion=h.engine.motions.get(source);await h.engine.switchMix([[{id:'shared'},.6],[{id:'new'},.2]]);
  assert.equal(h.engine.tracks.get('shared').source,source);assert.equal(h.engine.motions.get(source),motion);assert.equal(h.oscillators.length,3);
  h.ctx.currentTime+=1;t.mock.timers.tick(1000);assert.equal(h.engine.sourceRefs.size,2);assert.equal(h.engine.motions.size,2);assert.equal(h.oscillators.filter(o=>o.stops).length,1);
});
test('a switch finishing its load after sleep expiry cannot commit or resume',async t=>{
  const h=harness(t);await h.engine.add({id:'old'},.5);await h.engine.play();let release;
  h.engine.load=()=>new Promise(resolve=>{release=resolve;});const pending=h.engine.switchMix([[{id:'late'},.5]]);
  for(let i=0;i<10;i++)await Promise.resolve();h.engine.sleepAt=Date.now()-1;release({buffer:{duration:20}});
  assert.equal(await pending,false);assert.equal(h.engine.playing,false);assert.deepEqual([...h.engine.tracks.keys()],['old']);
});
test('sleep expiry during device resume cannot commit a paused mix request',async t=>{
  const h=harness(t);await h.engine.add({id:'old'},.5);h.engine.sleepAt=Date.now()+60000;
  let resume;h.ctx.resume=()=>new Promise(resolve=>{resume=()=>{h.ctx.state='running';resolve();};});
  const pending=h.engine.switchMix([[{id:'late'},.5]]);for(let i=0;i<10;i++)await Promise.resolve();
  h.engine.sleepAt=Date.now()-1;resume();assert.equal(await pending,false);assert.equal(h.engine.playing,false);assert.deepEqual([...h.engine.tracks.keys()],['old']);
});
test('8-track motion scenes stay bounded during overlap and release every outgoing modulator',async t=>{
  const h=harness(t);h.engine.setDynamic(true);for(let i=0;i<8;i++)await h.engine.add({id:'a'+i},.5);await h.engine.play();
  await h.engine.switchMix(Array.from({length:8},(_,i)=>[{id:'b'+i},.5]));assert.equal(h.engine.tracks.size,8);assert.equal(h.engine.motions.size,16);
  assert.equal(h.oscillators.filter(o=>o.starts&&!o.stops).length,16);h.ctx.currentTime+=1;t.mock.timers.tick(1000);
  assert.equal(h.engine.motions.size,8);assert.equal(h.oscillators.filter(o=>o.starts&&!o.stops).length,8);
});
