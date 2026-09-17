import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),exe=process.argv[2];assert.ok(exe,'Pass the packaged executable');
const out=path.join(root,'test-results'),env={...process.env,QUIET_FIELD_TEST_DATA:path.join(out,'expansion-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,args:[],env,timeout:60000});
try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setAudioMuted(true);w.setBounds({x:50,y:50,width:1536,height:1024});w.showInactive();});
 await page.context().addInitScript(()=>{window.__sources=[];const Original=window.AudioContext;window.AudioContext=class extends Original{createBufferSource(){const s=super.createBufferSource();window.__sources.push(s);const stop=s.stop.bind(s);s.stop=(...a)=>{s.__stopped=true;return stop(...a);};return s;}};});
 await page.context().setOffline(true);await page.reload();await page.getByRole('heading',{name:'声音库',exact:true}).waitFor();assert.equal(await page.locator('.sound-card').count(),53);
 for(const [name,fragment] of [['风铃轻奏','24 bit PCM'],['洞穴滴水','非实地洞穴录音'],['雨后夜林','远处公路声']]){
  await page.getByRole('button',{name:name+'详情',exact:true}).click();assert.ok((await page.getByRole('dialog').innerText()).includes(fragment));await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
 }
 const names=['猫咪呼噜','风铃轻奏','车内听雨','机械时钟','电风扇','伞下听雨','柴火壁炉','键盘打字'];
 for(const name of names)await page.getByRole('button',{name:'播放'+name,exact:true}).click();
 await page.waitForFunction(()=>window.__sources.filter(s=>!s.__stopped&&s.buffer).length===8,null,{timeout:120000});
 await page.getByRole('slider',{name:'混音 电风扇音量',exact:true}).fill('300');
 const buffers=await page.evaluate(()=>window.__sources.filter(s=>!s.__stopped&&s.buffer).map(s=>{let e=0,peak=0;for(const v of s.buffer.getChannelData(0)){e+=v*v;peak=Math.max(peak,Math.abs(v));}return{loop:s.loop,duration:s.buffer.duration,channels:s.buffer.numberOfChannels,rms:Math.sqrt(e/s.buffer.length),peak};}));
 for(const s of buffers){assert.ok(s.loop);assert.ok(s.rms>0);assert.ok(s.peak<=.951);}
 await page.getByRole('button',{name:'保存组合',exact:true}).click();await page.getByLabel('给组合起个名字').fill('新增音源八路验收');await page.getByRole('dialog').getByRole('button',{name:'保存组合',exact:true}).click();
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.mix-track').length===8&&[...document.querySelectorAll('.mix-name')].every(n=>!n.textContent.includes('准备中')),null,{timeout:120000});
 assert.equal(await page.getByRole('slider',{name:'混音 电风扇音量',exact:true}).inputValue(),'300');
 await page.getByRole('button',{name:'我的组合',exact:true}).click();await page.getByRole('heading',{name:'新增音源八路验收',exact:true}).waitFor();
 await page.getByRole('button',{name:'全部声音',exact:true}).click();await page.getByRole('button',{name:'清空',exact:true}).click();
 for(const name of ['猫咪呼噜','风铃轻奏','车内听雨'])await page.getByRole('button',{name:'播放'+name,exact:true}).click();
 await page.waitForFunction(()=>window.__sources.filter(s=>!s.__stopped&&s.buffer).length===3,null,{timeout:120000});
 await page.getByRole('slider',{name:'混音 风铃轻奏音量',exact:true}).fill('35');await page.getByRole('slider',{name:'混音 猫咪呼噜音量',exact:true}).fill('65');
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(600);await page.evaluate(()=>document.querySelector('.workspace')?.scrollTo(0,0));
 await page.screenshot({path:path.join(out,'public-1.4.0-desktop.png'),scale:'css'});
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'expansion-public.json'),JSON.stringify({passed:true,version:'1.4.0',catalogCount:53,offline:true,eightNewTracks:names,buffers,detailsVerified:true,saveReload:true,boostRestored:300,errors},null,2));console.log('PASS 53-card public package, 8 new offline tracks, 300% volume, details, saved mix and reload');
}finally{await app.close();}
