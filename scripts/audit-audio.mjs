import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
const catalog=JSON.parse(await fs.readFile('dist/catalog.json','utf8'));
const worker=(await fs.readdir('dist/assets')).find(x=>x.startsWith('audio-worker-'));
const env={...process.env,QUIET_FIELD_TEST_DATA:path.join(out,'audio-audit-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[root],env,timeout:60000});
try {
  const page=await app.firstWindow();page.on('console',msg=>{if(msg.text().startsWith('MATCH'))console.log(msg.text());});await page.getByRole('heading',{name:'声音库'}).waitFor();
  await page.context().setOffline(true);
  const results=[];
  for(const sound of catalog.filter(s=>!process.env.AUDIT_SOUND||s.id===process.env.AUDIT_SOUND)) {
    const result=await page.evaluate(async({sound,worker})=>{
      const ctx=new OfflineAudioContext(2,1024,48000);
      let original,channels;
      if(!sound.generated){original=await ctx.decodeAudioData(await (await fetch(sound.path)).arrayBuffer());channels=Array.from({length:Math.min(2,original.numberOfChannels)},(_,i)=>original.getChannelData(i).slice());}
      const workerObj=new Worker('./assets/'+worker,{type:'module'});
      const result=await new Promise((resolve,reject)=>{
        workerObj.onmessage=({data})=>data.error?reject(new Error(data.error)):resolve(data.result);
        workerObj.onerror=e=>reject(new Error(e.message));
        workerObj.postMessage(sound.generated?{id:1,kind:sound.id,rate:48000}:{id:1,channels,rate:48000,seconds:4},channels?.map(c=>c.buffer)||[]);
      });workerObj.terminate();
      const c=result.channels[0],n=c.length,rate=result.rate;
      let peak=0,energy=0,seamEnergy=0;
      for(const v of c){if(!Number.isFinite(v))throw new Error('non-finite audio');peak=Math.max(peak,Math.abs(v));energy+=v*v;}
      for(let i=0;i<Math.min(rate/10,n);i++)seamEnergy+=c[i]**2+c[n-1-i]**2;
      // Render a real AudioBufferSourceNode through the wrap: no main-thread timer.
      const before=Math.min(4096,Math.floor(n/3)),count=before*2;
      const renderCtx=new OfflineAudioContext(result.channels.length,n+before,rate);
      const b=renderCtx.createBuffer(result.channels.length,n,rate);result.channels.forEach((c,i)=>b.copyToChannel(c,i));
      const source=renderCtx.createBufferSource();source.buffer=b;source.loop=true;source.loopEnd=b.duration;source.connect(renderCtx.destination);source.start(0);
      const rendered=await renderCtx.startRendering(),actual=rendered.getChannelData(0).subarray(n-before,n+before);
      const errors=[-1,0,1].map(shift=>{let error=0;for(let i=0;i<count;i++)error=Math.max(error,Math.abs(actual[i]-c[(n-before+i+shift+n)%n]));return {shift,error};});
      const best=errors.reduce((a,b)=>a.error<b.error?a:b);
      if(best.error>.0001){const matches=[];for(let i=0;i<n-3;i++)if(Math.abs(c[i]-actual[before])<1e-8&&Math.abs(c[i+1]-actual[before+1])<1e-8)matches.push(i);console.log('MATCH',JSON.stringify({matches,start:source.loopStart,end:source.loopEnd,dur:source.buffer.duration}));}
      return {id:sound.id,name:sound.name,loudness:result.loudness,originalDuration:original?.duration,loopDuration:result.duration,trimmedSeconds:result.trimmed,crossfade:result.crossfade,peak,rms:Math.sqrt(energy/n),seamRms:Math.sqrt(seamEnergy/(2*Math.min(rate/10,n))),renderMaxError:best.error,offsetRoundingSamples:best.shift,...(best.error>.0001?{debug:{n,before,errors,actualStart:[...actual.slice(0,8)],expectedStart:[...c.slice(n-before,n-before+8)],actualSeam:[...actual.slice(before-4,before+4)],expectedSeam:[...c.slice(n-4),...c.slice(0,4)],actualEnd:[...actual.slice(-8)],expectedEnd:[...c.slice(before-8,before)]}}:{})};
    },{sound,worker});
    if(result.renderMaxError>=.0001)console.log('RENDER MISMATCH',JSON.stringify(result));
    assert.ok(result.peak<=.951,sound.id+' clipping');assert.ok(result.rms>1e-7,sound.id+' silent');assert.ok(result.renderMaxError<.0001,sound.id+' loop discontinuity');
    results.push(result);if(results.length%10===0)console.log('Audited',results.length,'/',catalog.length);
  }
  await fs.writeFile(path.join(out,'audio-audit.json'),JSON.stringify({passed:true,recordings:results.length,method:'Decode every local sound; process with production Worker; offline-render native loop across boundary and compare each sample with expected PCM.',results},null,2));
  console.log('PASS all',results.length,'sounds: decode, loop processing, headroom, actual render across boundary');
} finally{await app.close();}
