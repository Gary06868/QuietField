import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {chineseUI,englishUI} from './test-locale.mjs';
const exe=process.argv[2];assert.ok(exe,'Pass the packaged executable');
const out=path.resolve(process.argv[3]||'test-results/wave-g');await fs.mkdir(out,{recursive:true});
const profile=path.join(out,'profile-'+Date.now());const env={...process.env,QUIET_FIELD_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,args:[],env,timeout:60000});const checks=[],errors=[];
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.context().addInitScript(()=>{
  window.__waveQA={requests:[],results:[],sources:[]};
  const OriginalWorker=window.Worker;window.Worker=class extends OriginalWorker{
   constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.result)window.__waveQA.results.push({id:data.id,loudness:data.result.loudness,duration:data.result.duration,rate:data.result.rate});});}
   postMessage(value,...args){window.__waveQA.requests.push({id:value.id,preserveLoudness:value.preserveLoudness===true,kind:value.kind});return super.postMessage(value,...args);}
  };
  const Context=window.AudioContext;window.AudioContext=class extends Context{
   createBufferSource(){const s=super.createBufferSource();const stop=s.stop.bind(s);s.stop=(...args)=>{s.__stopped=true;return stop(...args)};window.__waveQA.sources.push(s);return s;}
  };
 });
 // Seed a saved mix in the 1.6.1 schema: the stable ID must resolve to G.
 await page.evaluate(()=>localStorage.setItem('quiet-field-settings',JSON.stringify({version:2,locale:'zh-CN',master:.4,mix:{'wav-waves':.6},favorites:['wav-waves'],saved:[{id:'old-wave',name:'原来的海岸组合',mix:{'wav-waves':.6}}],backgroundId:'alpine'})));
 await page.reload();await page.getByRole('heading',{name:'今天，听见宁静。'}).waitFor();await page.context().setOffline(true);
 const runtime=await app.evaluate(({app,BrowserWindow,ipcMain})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setAudioMuted(true);w.setContentSize(1180,760);w.showInactive();return {appPath:app.getAppPath(),userData:app.getPath('userData'),version:app.getVersion(),updateReadyListeners:ipcMain.listenerCount('updates-ready')};});
 assert.equal(path.resolve(runtime.userData),profile);assert.equal(runtime.version,'1.7.0');
 const catalog=JSON.parse(await fs.readFile(path.join(runtime.appPath,'dist/catalog.json'))),edition=JSON.parse(await fs.readFile(path.join(runtime.appPath,'dist/edition.json')));
 const wave=catalog.find(s=>s.id==='wav-waves');assert.equal(wave.path,'./processed/wav-waves-g.wav');assert.equal(wave.processing,'G');assert.equal(wave.preserveLoudness,true);
 assert.equal(createHash('sha256').update(await fs.readFile(path.join(runtime.appPath,'dist/processed/wav-waves-g.wav'))).digest('hex'),wave.sha256);
 await assert.rejects(fs.access(path.join(runtime.appPath,'dist/sounds/wav/wav-waves.wav')));
 assert.equal(catalog.length,edition.edition==='personal'?126:71);checks.push('Both audio identity and reviewed G file match; only processed wave is bundled');
 await page.getByRole('button',{name:'海岸浪潮详情',exact:true}).click();const details=await page.getByRole('dialog').innerText();assert.ok(details.includes('已保留处理后的音量'));assert.ok(details.includes('已减弱低频轰鸣'));await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'播放全部',exact:true}).click();await page.waitForFunction(()=>window.__waveQA.results.length>0&&document.querySelectorAll('.spin').length===0);
 const processed=await page.evaluate(()=>({request:window.__waveQA.requests[0],result:window.__waveQA.results[0],sources:window.__waveQA.sources.filter(s=>s.buffer&&!s.__stopped).map(s=>({loop:s.loop,start:s.loopStart,end:s.loopEnd,duration:s.buffer.duration,channels:s.buffer.numberOfChannels}))}));
 assert.equal(processed.request.preserveLoudness,true);assert.equal(processed.result.loudness.gainDb,0);assert.equal(processed.result.loudness.prebalanced,true);
 assert.equal(processed.sources.length,1);assert.equal(processed.sources[0].loop,true);assert.equal(processed.sources[0].channels,2);assert.ok(processed.sources[0].duration>26&&processed.sources[0].duration<27);
 checks.push('Actual playback uses G without makeup gain and the production seamless loop');
 await page.getByRole('button',{name:'设置',exact:true}).click();assert.equal(await page.getByRole('dialog').getByRole('checkbox').count(),1,'only the existing Light mode toggle');assert.equal(await page.getByRole('dialog').getByText('海岸浪潮去风声',{exact:true}).count(),0);await page.keyboard.press('Escape');
 checks.push('No new recording switch or setting was added');
 await page.getByRole('button',{name:'我的组合',exact:true}).click();await page.locator('.saved-item').filter({hasText:'原来的海岸组合'}).getByRole('button',{name:'播放',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.spin').length===0);
 assert.equal((await page.evaluate(()=>window.desktop.companionState())).playing,true);assert.equal(await page.locator('.mix-track').count(),1);assert.equal(await page.locator('.mix-track input').inputValue(),'60');
 checks.push('Existing saved mix and track volume keep working under the original sound ID');
 await page.getByRole('button',{name:'全部声音',exact:true}).click();await page.getByRole('button',{name:'播放小雨',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.spin').length===0&&window.__waveQA.results.length>=2);
 const rain=await page.evaluate(()=>window.__waveQA.results.find(r=>!r.loudness.prebalanced));assert.ok(rain);assert.notEqual(rain.loudness.gainDb,0);assert.equal(await page.locator('.mix-track').count(),2);
 checks.push('Other recordings keep ordinary loudness balancing and mix normally with G');
 await englishUI(page);await page.getByRole('button',{name:'Coastal surf details',exact:true}).click();assert.ok(!/[\u4e00-\u9fff]/.test(await page.getByRole('dialog').innerText()));await page.keyboard.press('Escape');
 await chineseUI(page);await page.reload();await page.locator('.sound-card').first().waitFor();const settings=await page.evaluate(()=>JSON.parse(localStorage.getItem('quiet-field-settings')));assert.equal(settings.saved[0].id,'old-wave');assert.equal(settings.saved[0].name,'原来的海岸组合');assert.ok(settings.favorites.includes('wav-waves'));
 if(edition.edition==='personal'){assert.equal(await page.locator('.updates-entry').count(),0);assert.equal(runtime.updateReadyListeners,0);checks.push('Personal edition has no update service or Messages entry');}
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'wave-g-'+edition.edition+'.png'),scale:'css'});
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,edition,runtime,processed,checks,errors},null,2));console.log('PASS',JSON.stringify(checks));
}finally{await app.close();}
