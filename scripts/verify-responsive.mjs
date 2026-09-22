import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'test-results/responsive');await fs.mkdir(out,{recursive:true});
const env={...process.env,QUIET_FIELD_TEST_DATA:path.join(out,'profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const exe=process.argv[2];const app=await electron.launch({...(exe?{executablePath:exe}:{}),args:exe?[]:[root],env});
const errors=[],checks=[];
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 for(const locale of ['zh-CN','en']){
  await page.evaluate(locale=>localStorage.setItem('quiet-field-settings',JSON.stringify({locale})),locale);await page.reload();await page.locator('.sound-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  for(const [width,height] of [[826,604],[760,600],[1000,680],[1180,660],[1536,960],[390,844]]){
   await app.evaluate(({BrowserWindow},{width,height})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setAudioMuted(true);w.setMinimumSize(320,400);w.setContentSize(width,height);w.show();},{width,height});
   await page.waitForTimeout(300);console.log(JSON.stringify({requested:[width,height],actual:await page.evaluate(()=>[innerWidth,innerHeight])}));await page.waitForFunction(({width,height})=>Math.abs(innerWidth-width)<=1&&Math.abs(innerHeight-height)<=1,{width,height},{timeout:5000});
   const metrics=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};const nav=document.querySelector('.sidebar nav'),main=document.querySelector('main');return{viewport:[innerWidth,innerHeight],app:rect('.app'),brand:rect('.brand'),brandText:rect('.brand span'),brandLine:parseFloat(getComputedStyle(document.querySelector('.brand span')).fontSize),language:rect('.language-switch'),navHeight:nav.clientHeight,mainHeight:main.clientHeight,mainScroll:main.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.sound-grid')).gridTemplateColumns.split(' ').length,firstCard:rect('.sound-card'),transport:rect('.transport')};});
   await page.screenshot({path:path.join(out,`${locale}-${width}x${height}.png`),scale:'css'});
   assert.equal(metrics.overflow,false,'no horizontal page overflow');assert.ok(metrics.app.height<=metrics.viewport[1]+1,'library must not extend the whole page');
   assert.ok(metrics.brandText.height<metrics.brandLine*2,'brand stays on one line');assert.ok(metrics.firstCard.bottom<=metrics.transport.y,'first cards visible above playback');
   if(width>540)assert.ok(metrics.navHeight>=210,'category menu shows more than three entries');
   const before=await page.locator('.brand-icon').boundingBox();await page.locator('main').evaluate(e=>e.scrollTop=e.scrollHeight);await page.locator('.sidebar nav').evaluate(e=>e.scrollTop=e.scrollHeight);const after=await page.locator('.brand-icon').boundingBox();assert.equal(before.y,after.y,'brand remains fixed while library and navigation scroll');await page.locator('main').evaluate(e=>e.scrollTop=0);await page.locator('.sidebar nav').evaluate(e=>e.scrollTop=0);
   if(width<=1050){
    if(width===826){await page.locator('.sound-toggle').first().click();await page.waitForFunction(()=>document.querySelectorAll('.spin').length===0);}
    const open=page.locator('.compact-mixer-button');await open.click();const dialog=page.getByRole('dialog');await dialog.waitFor();if(width===826){await dialog.locator('.mix-track input').fill('125');assert.equal(await page.locator('.sound-card.active input').inputValue(),'125','drawer adjusts the same live mix');}
    if(width===826)await page.screenshot({path:path.join(out,locale+'-compact-mixer.png'),scale:'css'});await dialog.locator('.timer select').selectOption('15');assert.ok(await dialog.locator('.timer select').inputValue()==='active');await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await open.evaluate(e=>e===document.activeElement),true,'drawer restores keyboard focus');
    if(width===826){await open.click();await page.getByRole('dialog').locator('.mix-actions .primary').click();await page.getByRole('dialog').locator('#mix-name').fill('Compact '+locale);await page.getByRole('dialog').locator('form .primary').click();assert.ok(await page.evaluate(locale=>JSON.parse(localStorage.getItem('quiet-field-settings')).saved.some(s=>s.name==='Compact '+locale),locale),'mix saved through the compact drawer');await page.locator('.play-button').click();}
   }else assert.equal(await page.locator('.mixer').isVisible(),true);
   checks.push({locale,width,height,metrics});
  }
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,executable:exe||null,checks,errors},null,2));console.log('PASS native responsive layout, category and library scroll, mixer timer and keyboard focus at 12 bilingual sizes');
}finally{await app.close();}
