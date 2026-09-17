import {chineseUI} from './test-locale.mjs';
import {_electron as electron} from 'playwright';import path from 'node:path';import fs from 'node:fs/promises';
const env={...process.env,QUIET_FIELD_TEST_DATA:path.resolve('test-results/preview-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:process.argv[2],args:[],env,timeout:60000});
try{const page=await app.firstWindow();await chineseUI(page);await page.getByRole('heading',{name:'今天，听见宁静。'}).waitFor();
await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setAudioMuted(true);w.showInactive();});await page.setViewportSize({width:1536,height:1000});
for(const name of ['猫咪呼噜','风铃轻奏','车内听雨'])await page.getByRole('button',{name:'播放'+name,exact:true}).click();
await page.waitForFunction(()=>document.querySelectorAll('.mix-track').length===3&&[...document.querySelectorAll('.mix-name')].every(n=>!n.textContent.includes('准备中')),null,{timeout:120000});
for(const [name,vol] of [['猫咪呼噜','65'],['风铃轻奏','35']])await page.getByRole('slider',{name:'混音 '+name+'音量',exact:true}).fill(vol);
await page.evaluate(()=>{document.querySelector('main').scrollTo({top:0,behavior:'instant'});return document.fonts.ready;});await page.waitForTimeout(500);
await fs.mkdir('docs/images',{recursive:true});await page.screenshot({path:'docs/images/desktop.png',scale:'css'});
await page.getByRole('button',{name:'物品',exact:true}).click();await page.waitForTimeout(300);await page.screenshot({path:'docs/images/objects.png',scale:'css'});
console.log('Captured real packaged app previews');}finally{await app.close();}
