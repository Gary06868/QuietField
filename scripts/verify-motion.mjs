import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'test-results/motion');await fs.mkdir(out,{recursive:true});
const env={...process.env,QUIET_FIELD_TEST_DATA:path.join(out,'profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const exe=process.argv[2];const app=await electron.launch({...(exe?{executablePath:exe}:{}),args:exe?[]:[root],env});
const results=[];
try{
 const page=await app.firstWindow();await page.evaluate(()=>localStorage.setItem('quiet-field-settings',JSON.stringify({locale:'zh-CN',backgroundId:'aurora',animateBackground:true})));await page.reload();await page.getByRole('heading',{name:'今天，听见宁静。'}).waitFor();
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1280,800);w.show();});await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>document.fonts.ready);
 for(const id of ['aurora','starlight']){
  await page.getByRole('button',{name:'更换背景',exact:true}).click();await page.locator(`.background-card:has(.background-swatch--${id})`).click();await page.getByText('背景正在轻柔流动。',{exact:true}).waitFor();await page.getByRole('button',{name:'关闭弹窗'}).click();await page.waitForFunction(()=>document.querySelector('.qf-background').dataset.animate==='true');
  const before=await page.evaluate(async()=>{const nodes=[...document.querySelectorAll('.qf-aurora,.qf-stars')];for(const node of nodes)for(const a of node.getAnimations()){a.pause();a.currentTime=0;}await new Promise(r=>requestAnimationFrame(r));return nodes.map(e=>({transform:getComputedStyle(e).transform,opacity:getComputedStyle(e).opacity}));});
  const beforePng=await page.screenshot({path:path.join(out,id+'-before.png'),scale:'css'});
  const after=await page.evaluate(async()=>{const nodes=[...document.querySelectorAll('.qf-aurora,.qf-stars')];for(const node of nodes)for(const a of node.getAnimations())a.currentTime=3000;await new Promise(r=>requestAnimationFrame(r));return nodes.map(e=>({transform:getComputedStyle(e).transform,opacity:getComputedStyle(e).opacity}));});
  const afterPng=await page.screenshot({path:path.join(out,id+'-after.png'),scale:'css'});
  const pixels=await app.evaluate(({nativeImage},{beforePng,afterPng})=>{const beforeImage=nativeImage.createFromBuffer(Buffer.from(beforePng)).resize({width:640}),afterImage=nativeImage.createFromBuffer(Buffer.from(afterPng)).resize({width:640}),before=beforeImage.toBitmap(),after=afterImage.toBitmap();let sum=0,changed=0;for(let i=0;i<after.length;i+=4){const diff=Math.abs(after[i]-before[i])+Math.abs(after[i+1]-before[i+1])+Math.abs(after[i+2]-before[i+2]);sum+=diff;if(diff>=6)changed++;}return{meanRgbDelta:sum/(after.length/4*3),changedPercent:100*changed/(after.length/4)};},{beforePng:[...beforePng],afterPng:[...afterPng]});
  console.log(id,JSON.stringify(pixels));
  assert.ok(after.some((s,i)=>s.transform!==before[i].transform),id+' visibly drifts rather than brightness only');
  if(id==='aurora'){const duration=await page.locator('.qf-aurora').first().evaluate(e=>parseFloat(getComputedStyle(e).animationDuration));assert.ok(duration<=20,'aurora movement must be perceptible within a few seconds');assert.ok(pixels.meanRgbDelta>=.4,'aurora must visibly change across the real rendered window over three seconds');}
  else assert.ok(pixels.changedPercent>=.1,'drifting stars must move rendered pixels');
  results.push({id,before,after,pixels});
  await page.evaluate(()=>document.querySelectorAll('.qf-aurora,.qf-stars').forEach(e=>e.getAnimations().forEach(a=>a.play())));
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'更换背景'}).click();await page.getByText('系统已开启减少动态效果，背景动画已暂停。',{exact:true}).waitFor();assert.equal(await page.locator('.qf-stars').first().evaluate(e=>getComputedStyle(e).animationName),'none');assert.equal(await page.locator('.qf-background').getAttribute('data-animate'),'false');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('checkbox').uncheck();await page.getByText('动态已关闭，当前显示静态画面。',{exact:true}).waitFor();assert.equal(await page.locator('.qf-background').getAttribute('data-animate'),'false');await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'关闭弹窗'}).click();await page.getByRole('button',{name:'关于声音与循环'}).click();await page.getByRole('button',{name:'开启轻量模式',exact:true}).click();await page.getByRole('button',{name:'关闭弹窗'}).click();await page.getByRole('button',{name:'更换背景'}).click();await page.getByText('轻量模式已开启，背景动画已暂停。',{exact:true}).waitFor();assert.equal(await page.locator('.qf-background').getAttribute('data-animate'),'false');await page.getByRole('button',{name:'关闭轻量模式',exact:true}).click();await page.getByText('背景正在轻柔流动。',{exact:true}).waitFor();assert.equal(await page.locator('.qf-background').getAttribute('data-animate'),'true');
 await page.locator('.background-card:has(.background-swatch--alpine)').click();await page.getByText('这是静态背景。选择极光或星海，即可体验动态。',{exact:true}).waitFor();await page.locator('.background-card:has(.background-swatch--aurora)').click();await page.getByRole('button',{name:'关闭弹窗'}).click();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());await page.waitForFunction(()=>document.querySelector('.qf-background').dataset.animate==='false');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());await page.waitForFunction(()=>document.querySelector('.qf-background').dataset.animate==='true');
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,executable:exe||null,results},null,2));console.log('PASS perceptible aurora and star drift; OS, light-mode, user toggle and hidden-window pause states');
}finally{await app.close();}
