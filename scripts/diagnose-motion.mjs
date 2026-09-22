import {_electron as electron} from 'playwright';import fs from 'node:fs/promises';import path from 'node:path';
const root=process.cwd(),out=path.join(root,'test-results/motion-diagnosis');await fs.mkdir(out,{recursive:true});
const env={...process.env,QUIET_FIELD_TEST_DATA:path.join(out,'profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[root],env});
try{const page=await app.firstWindow();await page.evaluate(()=>localStorage.setItem('quiet-field-settings',JSON.stringify({locale:'zh-CN',backgroundId:'aurora',animateBackground:true})));await page.reload();await page.getByRole('heading',{name:'今天，听见宁静。'}).waitFor();await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setBounds({x:30,y:30,width:1280,height:800});w.show();});
 const sample=()=>page.evaluate(()=>({reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,hidden:document.hidden,background:document.querySelector('.qf-background').dataset,light:document.querySelector('.app').classList.contains('reduced-effects'),layers:[...document.querySelectorAll('.qf-aurora')].map(el=>{const s=getComputedStyle(el);return {name:s.animationName,state:s.animationPlayState,duration:s.animationDuration,transform:s.transform,opacity:s.opacity,background:s.backgroundImage,currentTime:el.getAnimations().map(a=>a.currentTime)};})}));
 await page.waitForTimeout(800);const start=await sample();await page.screenshot({path:path.join(out,'before.png')});await page.waitForTimeout(3000);const after=await sample();await page.screenshot({path:path.join(out,'after.png')});
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(500);const forced=await sample();await page.waitForTimeout(3000);const forcedAfter=await sample();
 const r={start,after,forced,forcedAfter};await fs.writeFile(path.join(out,'diagnosis.json'),JSON.stringify(r,null,2));console.log(JSON.stringify(r));
}finally{await app.close();}
