import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {chineseUI,englishUI,openBackground} from './test-locale.mjs';
const root=process.cwd(),exe=process.argv[2],out=path.resolve(process.argv[3]||'test-results/settings-1.7.0');
await fs.mkdir(out,{recursive:true});const profile=path.join(out,'profile-'+Date.now());await fs.mkdir(profile);await fs.writeFile(path.join(profile,'desktop-prefs.json'),JSON.stringify({pinned:true}));
const env={...process.env,QUIET_FIELD_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
const launch=()=>electron.launch({...(exe?{executablePath:exe}:{}),args:exe?[]:[root],env,timeout:60000});
let app=await launch(),ended=false;const checks=[],errors=[];let baseline;
try{
 let page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.context().addInitScript(()=>{window.__qaAudio=[];const Original=window.AudioContext;window.AudioContext=class extends Original{constructor(...args){super(...args);window.__qaAudio.push(this);}};});await page.reload();
 await chineseUI(page);await page.locator('.sound-card').first().waitFor();
 const runtime=await app.evaluate(({app,BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setAudioMuted(true);w.setContentSize(1180,760);w.showInactive();return {userData:app.getPath('userData'),appPath:app.getAppPath(),version:app.getVersion()};});
 assert.equal(path.resolve(runtime.userData),profile);assert.equal(runtime.version,'1.7.0');
 const edition=JSON.parse(await fs.readFile(path.join(runtime.appPath,'dist/edition.json')));
 const catalog=JSON.parse(await fs.readFile(path.join(runtime.appPath,'dist/catalog.json')));
 assert.equal(await page.locator('.sound-card').count(),edition.sounds);assert.equal(edition.sounds,edition.edition==='public'?71:126);
 assert.equal(await page.locator('.sidebar-bottom .settings-button').count(),1);assert.equal(await page.locator('.sidebar-bottom .language-switch,.sidebar-bottom .appearance-button,.sidebar-bottom .about-button').count(),0);
 checks.push('Single Settings entry replaces scattered options; catalog count matches edition');
 // Exercise the actual import/save flow, with a test-only copy of a licensed source recording.
 const sample=path.join(out,'quietfield-settings-test-import.wav');await fs.copyFile(path.join(runtime.appPath,'dist/sounds/bigsoundbank/0267.wav'),sample);const sampleHash=createHash('sha256').update(await fs.readFile(sample)).digest('hex');
 await page.locator('input[type=file]').setInputFiles(sample);await page.locator('.sound-toggle').filter({hasText:'quietfield-settings-test-import'}).waitFor();
 await page.locator('.sound-card').filter({hasText:'quietfield-settings-test-import'}).locator('.favorite').click();await page.locator('.sound-toggle').filter({hasText:'quietfield-settings-test-import'}).click();await page.waitForFunction(()=>document.querySelectorAll('.spin').length===0);
 await page.getByRole('button',{name:'保存组合',exact:true}).click();await page.getByLabel('给组合起个名字').fill('保留测试 🌧');await page.getByRole('dialog').getByRole('button',{name:'保存组合',exact:true}).click();
 baseline=await page.evaluate(()=>JSON.parse(localStorage.getItem('quiet-field-settings')));assert.equal(baseline.saved[0].name,'保留测试 🌧');
 const imported=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('quiet-field-audio',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return await new Promise(resolve=>{const r=db.transaction('files').objectStore('files').getAll();r.onsuccess=async()=>{const item=r.result[0];resolve({id:item.id,name:item.name,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await item.blob.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('')})};})});assert.equal(imported.sha256,sampleHash);
 checks.push('Real file import, favorite and named mix saved under isolated profile');
 await page.getByRole('button',{name:'设置',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByRole('combobox',{name:'点击关闭按钮时'}).waitFor();await page.waitForFunction(()=>!document.querySelector('.settings-close select').disabled);
 assert.equal(await dialog.getByRole('combobox').inputValue(),'tray');
 await dialog.getByRole('checkbox',{name:'轻量模式',exact:true}).check();assert.equal(await page.locator('.app').evaluate(e=>e.classList.contains('reduced-effects')),true);await dialog.getByRole('checkbox',{name:'轻量模式',exact:true}).uncheck();
 await dialog.getByRole('tab',{name:'背景',exact:true}).click();assert.equal(await dialog.locator('.background-card').count(),8);await dialog.locator('.background-swatch--aurora').click();
 await dialog.getByRole('tab',{name:'关于与版权',exact:true}).click();assert.match(await dialog.innerText(),/MIT/);assert.match(await dialog.innerText(),/1\.7\.0/);
 await dialog.getByRole('tab',{name:'常规',exact:true}).click();await dialog.getByRole('button',{name:'English',exact:true}).click();assert.equal(await dialog.getByRole('heading',{name:'Language',exact:true}).count(),1);
 await dialog.getByRole('tab',{name:'About & credits',exact:true}).click();assert.ok(!/[\u4e00-\u9fff]/.test(await dialog.innerText()));
 await page.keyboard.press('Escape');assert.equal(await page.locator('.settings-button').evaluate(e=>e===document.activeElement),true);
 assert.equal((await page.evaluate(()=>window.desktop.companionState())).playing,true);checks.push('All settings work in one dialog; language switch keeps playback; escape restores focus');
 for(const [width,height] of [[1536,960],[826,604],[390,844]]){
  await page.setViewportSize({width,height});await page.getByRole('button',{name:'Settings',exact:true}).click();
  for(const name of ['General','Background','About & credits']){await page.getByRole('tab',{name,exact:true}).click();assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.getByRole('tab',{name:'General',exact:true}).click();await page.screenshot({path:path.join(out,'settings-en-'+width+'.png'),scale:'css'});await page.keyboard.press('Escape');
 }
 checks.push('General, background and credits fit at 1536, 826 and 390 px');
 await page.setViewportSize({width:1180,height:760});await chineseUI(page);await page.getByRole('button',{name:'全部声音',exact:true}).click();
 // Decode each new original through the actual mixer and loop worker.
 const newIds=new Set(['bsb-1046','bsb-0267','bsb-0265','bsb-1354','bsb-2856','bsb-2715']);const additions=catalog.filter(sound=>newIds.has(sound.id));assert.equal(additions.length,6);
 for(const sound of additions){await page.getByRole('button',{name:'播放'+sound.name,exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.spin').length===0,null,{timeout:120000});assert.equal(await page.getByRole('button',{name:'移除'+sound.name,exact:true}).count(),1);await page.getByRole('button',{name:'移除'+sound.name,exact:true}).click();}
 checks.push('Six newly licensed recordings decode and play in actual mixer');
 await page.screenshot({path:path.join(out,'main-zh.png'),scale:'css'});
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.screenshot({path:path.join(out,'settings-zh.png'),scale:'css'});await page.keyboard.press('Escape');
 const before=await page.evaluate(()=>({time:window.__qaAudio[0].currentTime,state:window.__qaAudio[0].state}));assert.equal(before.state,'running');
 await page.getByRole('button',{name:'关闭窗口',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.qf-background').dataset.animate==='false');
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);await page.waitForTimeout(700);assert.ok((await page.evaluate(()=>window.__qaAudio[0].currentTime))>before.time+.4);
 assert.equal((await page.evaluate(()=>window.desktop.companionState())).playing,true);
 // Second-instance equivalent uses the same existing companion show path.
 await page.evaluate(()=>window.desktop.companionAction('main'));assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),true);
 checks.push('Close hides the taskbar window, pauses graphics and keeps the audio engine running; restore works');
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.settings-close select').disabled);await page.getByRole('combobox',{name:'点击关闭按钮时'}).selectOption('quit');await page.waitForFunction(()=>!document.querySelector('.settings-close select').disabled);await page.keyboard.press('Escape');
 let prefs=JSON.parse(await fs.readFile(path.join(profile,'desktop-prefs.json')));assert.deepEqual(prefs,{pinned:true,closeToTray:false});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('quiet-field-settings')));assert.deepEqual(saved.saved,baseline.saved);assert.deepEqual(saved.favorites,baseline.favorites);
 const closed=app.waitForEvent('close');await page.getByRole('button',{name:'关闭窗口',exact:true}).click();await closed;ended=true;
 app=await launch();ended=false;page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.locator('.sound-card').first().waitFor();
 assert.equal((await page.evaluate(()=>window.desktop.companionState())).closeToTray,false);const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('quiet-field-settings')));assert.deepEqual(restored.saved,baseline.saved);assert.deepEqual(restored.favorites,baseline.favorites);assert.equal(restored.backgroundId,'aurora');
 const importedHash=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('quiet-field-audio',1);r.onsuccess=()=>resolve(r.result)});return await new Promise(resolve=>{const r=db.transaction('files').objectStore('files').getAll();r.onsuccess=async()=>resolve(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.result[0].blob.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join(''))})});assert.equal(importedHash,sampleHash);
 if(edition.edition==='personal'){assert.equal(await page.locator('.updates-entry').count(),0);assert.equal(await app.evaluate(({ipcMain})=>ipcMain.listenerCount('updates-ready')),0);checks.push('Personal edition still has no update service or Messages entry');}
 checks.push('Quit preference survives a real restart; pinned state, imported audio hash, favorites, mixes and background are retained');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,edition,runtime,profile,checks,errors},null,2));console.log('PASS',JSON.stringify(checks));
}finally{if(!ended)await app.close();}
