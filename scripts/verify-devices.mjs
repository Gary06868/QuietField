import {chineseUI} from './test-locale.mjs';
import {_electron as electron} from 'playwright';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'test-results'),env={...process.env,QUIET_FIELD_TEST_DATA:path.join(out,'device-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const exe=process.argv[2],app=await electron.launch({...(exe?{executablePath:exe}:{}),args:exe?[]:[root],env,timeout:60000});
try{
 const page=await app.firstWindow();await chineseUI(page);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setAudioMuted(true));
 await page.context().addInitScript(()=>{const Base=window.AudioContext;window.__deviceQA={fallback:false,contexts:[]};window.AudioContext=class extends Base{constructor(options){if(options?.sampleRate===48000){window.__deviceQA.fallback=true;throw new DOMException('simulated unsupported fixed rate','NotSupportedError');}super(options);window.__deviceQA.contexts.push(this);}};});
 await page.reload();await page.getByRole('button',{name:'播放棕噪声',exact:true}).click();await page.waitForFunction(()=>window.__deviceQA.contexts[0]?.state==='running');assert.ok(await page.evaluate(()=>window.__deviceQA.fallback));
 await page.evaluate(()=>window.__deviceQA.contexts[0].suspend());await app.evaluate(({powerMonitor})=>powerMonitor.emit('resume'));await page.waitForFunction(()=>window.__deviceQA.contexts[0].state==='running');
 await page.evaluate(()=>window.__deviceQA.contexts[0].suspend());await page.evaluate(()=>navigator.mediaDevices.dispatchEvent(new Event('devicechange')));await page.waitForFunction(()=>window.__deviceQA.contexts[0].state==='running');
 await page.getByRole('button',{name:'暂停全部'}).click();await page.waitForFunction(()=>window.__deviceQA.contexts[0].state==='suspended');await app.evaluate(({powerMonitor})=>powerMonitor.emit('resume'));await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.__deviceQA.contexts[0].state),'suspended');
 const result={passed:true,checks:['fixed sample rate rejection falls back to default device rate','suspended playing context resumes on simulated system resume','suspended playing context resumes on simulated device change','user pause is preserved across resume'],limits:'Events were simulated; no physical Bluetooth switching or machine sleep was performed.'};await fs.writeFile(path.join(out,'device-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await app.close();}
