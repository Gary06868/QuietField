import {chineseUI} from './test-locale.mjs';
import {_electron as electron} from 'playwright';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
const profile=path.join(out,'release-profile-'+Date.now());await fs.mkdir(profile,{recursive:true});
await fs.writeFile(path.join(profile,'window-state.json'),JSON.stringify({x:90000,y:-90000,width:6000,height:4000}));
const env={...process.env,QUIET_FIELD_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
const executable=process.argv[2];const launch=()=>electron.launch({...(executable?{executablePath:executable}:{}),args:executable?[]:[root],env,timeout:60000});
let app=await launch();const result={checks:[]};
try{
 let page=await app.firstWindow();await chineseUI(page);await page.getByRole('heading',{name:'今天，听见宁静。'}).waitFor();
 const bounds=await app.evaluate(({BrowserWindow,screen})=>{const b=BrowserWindow.getAllWindows()[0].getBounds();return {b,w:screen.getDisplayMatching(b).workArea};});
 assert.ok(bounds.b.x>=bounds.w.x-1&&bounds.b.y>=bounds.w.y-1&&bounds.b.x+bounds.b.width<=bounds.w.x+bounds.w.width+1&&bounds.b.y+bounds.b.height<=bounds.w.y+bounds.w.height+1);result.bounds=bounds;result.checks.push('offscreen saved bounds recovered inside current work area');
 for(const value of ['null','[]','42','{','{"saved":[null],"mix":null,"master":"bad"}']){
  await page.evaluate(v=>localStorage.setItem('quiet-field-settings',v),value);await page.reload();await chineseUI(page);await page.getByRole('heading',{name:'今天，听见宁静。'}).waitFor();assert.equal(await page.getByRole('slider',{name:'总音量',exact:true}).inputValue(),'50');
 }result.checks.push('five malformed preferences recover with usable controls');
 await page.getByRole('button',{name:'关于声音与循环',exact:true}).click();await page.getByRole('button',{name:'开启轻量模式'}).click();await page.getByRole('button',{name:'关闭弹窗'}).click();
 await page.reload();await chineseUI(page);await page.waitForSelector('.app.reduced-effects');assert.equal(await page.locator('canvas.ring').evaluate(c=>c.width),300);result.checks.push('lightweight mode persisted, spectrum drawing disabled');
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setBounds({x:40,y:40,width:1050,height:650});});await page.waitForTimeout(600);
 const saved=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNormalBounds());await app.close();app=await launch();page=await app.firstWindow();await chineseUI(page);await page.getByRole('heading',{name:'今天，听见宁静。'}).waitFor();
 const restored=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNormalBounds());console.log('RESTORE',JSON.stringify({saved,restored}));for(const k of ['x','y','width','height'])assert.ok(Math.abs(saved[k]-restored[k])<=1);result.checks.push('native window bounds restored after real process restart');
 for(let cycle=0;cycle<3;cycle++){await app.close();app=await launch();page=await app.firstWindow();await chineseUI(page);await page.getByRole('heading',{name:'今天，听见宁静。'}).waitFor();const b=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNormalBounds());assert.deepEqual(b,restored,'bounds must not grow on successive restarts');}result.checks.push('three additional restarts keep identical window bounds');
 await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.setBounds({x:9000,y:9000});screen.emit('display-removed',{},{});});await page.waitForTimeout(450);
 const recovered=await app.evaluate(({BrowserWindow,screen})=>{const b=BrowserWindow.getAllWindows()[0].getBounds();return{b,w:screen.getDisplayMatching(b).workArea};});assert.ok(recovered.b.x<recovered.w.x+recovered.w.width&&recovered.b.y<recovered.w.y+recovered.w.height);result.checks.push('simulated display removal moves window back');
 result.passed=true;await fs.writeFile(path.join(out,'release-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await app.close();}


