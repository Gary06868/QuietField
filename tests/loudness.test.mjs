import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as audio from '../src/loudness.js';
const sine=(amplitude,n=48000)=>Float32Array.from({length:n},(_,i)=>amplitude*Math.sin(2*Math.PI*440*i/48000));
const rms=data=>Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);
test('quiet and loud steady recordings converge to comparable baseline levels',()=>{
  const quiet=sine(.008),loud=sine(.4);
  audio.normalizeLoudness([quiet],48000);audio.normalizeLoudness([loud],48000);
  assert.ok(rms(quiet)>.10);assert.ok(Math.abs(20*Math.log10(rms(quiet)/rms(loud)))<.1);
});
test('rare transients do not prevent raising the ambient background, nor clip',()=>{
  const data=sine(.012);data[5000]=.9;
  const info=audio.normalizeLoudness([data],48000);
  assert.ok(info.gainDb>15);assert.ok(rms(data)>.08);
  assert.ok(data.every(x=>Number.isFinite(x)&&Math.abs(x)<=.951));
});
test('stereo uses shared gain; moderate values retain channel balance',()=>{
  const left=sine(.03),right=sine(.015);audio.normalizeLoudness([left,right],48000);
  assert.ok(Math.abs(rms(left)/rms(right)-2)<.001);
});
test('long silence is not used to over-amplify sparse audible events',()=>{
  const isolated=new Float32Array(48000*4);isolated.set(sine(.2,19200),48000);
  const continuous=sine(.2,48000*4);
  const a=audio.normalizeLoudness([isolated],48000),b=audio.normalizeLoudness([continuous],48000);
  assert.ok(Math.abs(a.gainDb-b.gainDb)<.1);
});
test('volume bounds distinguish boosted tracks from the master',()=>{
  assert.equal(audio.trackVolume(2.5),2.5);assert.equal(audio.trackVolume(99),3);
  assert.equal(audio.trackVolume(-1),0);assert.equal(audio.trackVolume(NaN),0);
  assert.equal(audio.masterVolume(2.5),1);
});
test('final protection is symmetric, linear at normal levels and bounded',()=>{
  const curve=audio.protectionCurve();
  assert.equal(curve[(curve.length-1)/2],0);
  for(let i=0;i<curve.length;i++)assert.ok(Math.abs(curve[i]+curve[curve.length-1-i])<1e-6);
  assert.ok(Math.max(...curve)<.95);
});
