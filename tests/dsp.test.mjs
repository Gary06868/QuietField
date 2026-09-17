import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeLoop,makeNoise} from '../src/dsp.js';
test('loop seam reproduces adjacent original samples, not a cut',()=>{
  const rate=1000, data=Float32Array.from({length:9000},(_,i)=>.3*Math.sin(i*.033)+.1);
  const loop=makeLoop([data],rate,2),out=loop.channels[0];
  assert.equal(out.length,7000);
  assert.ok(Math.abs(out.at(-1)-data[1999])<1e-7);
  assert.equal(out[0],data[2000]);
  assert.ok(Math.abs((out[0]-out.at(-1))-(data[2000]-data[1999]))<1e-7);
});
test('correlated overlap does not boost constant signal',()=>{
  const result=makeLoop([new Float32Array(10000).fill(.5)],1000,2);
  for(const x of result.channels[0])assert.ok(Math.abs(x-.5)<1e-7);
});
test('padding silence is removed while internal content is retained',()=>{
  const x=new Float32Array(12000);x.fill(.25,1000,11000);
  const result=makeLoop([x],1000,2);
  assert.equal(result.trimmed,2);assert.equal(result.duration,8);
  assert.ok(result.channels[0].every(x=>Math.abs(x-.25)<1e-7));
});
test('stereo channels remain independent, with headroom',()=>{
  const result=makeLoop([new Float32Array(10000).fill(.8),new Float32Array(10000).fill(-.4)],1000,2);
  assert.equal(result.channels.length,2);
  assert.ok(result.channels[0].every(x=>x>.79&&x<.81));
  assert.ok(result.channels[1].every(x=>x<-.39&&x>-.41));
});
test('silent and impossibly short files report an error',()=>{
  assert.throws(()=>makeLoop([new Float32Array(10000)],1000));
  assert.throws(()=>makeLoop([new Float32Array(10).fill(.3)],1000));
});
test('short recordings adapt overlap; output stays finite',()=>{
  const result=makeLoop([Float32Array.from({length:500},(_,i)=>.4*Math.sin(i))],1000,4);
  assert.equal(result.crossfade,.125);assert.equal(result.duration,.375);
  assert.ok(result.channels[0].every(Number.isFinite));
});
test('noise generators produce independent, bounded, non-silent stereo',()=>{
  for(const kind of ['white-noise','pink-noise','brown-noise']) {
    const result=makeNoise(kind,48000,1);
    for(const channel of result.channels) {
      let sum=0,peak=0;for(const v of channel){assert.ok(Number.isFinite(v));sum+=v*v;peak=Math.max(peak,Math.abs(v));}
      assert.ok(Math.sqrt(sum/channel.length)>.01);assert.ok(peak<=.951);
    }
    assert.notDeepEqual(result.channels[0],result.channels[1]);
  }
});
test('48 kHz loop duration has exact binary representation at problematic boundary',()=>{
  const n=8089804+192000;
  const result=makeLoop([new Float32Array(n).fill(.1)],48000,4);
  assert.equal(result.duration*128,Math.round(result.duration*128));
  assert.equal(result.duration*48000,result.channels[0].length);
  assert.ok(result.trimmed<.007813);
  assert.equal(result.channels[0][0],result.channels[0].at(-1));
});
