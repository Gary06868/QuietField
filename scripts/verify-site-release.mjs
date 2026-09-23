import {_electron as electron,chromium} from 'playwright';
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'test-results/release-1.6.1');await fs.mkdir(out,{recursive:true});
if(process.argv.includes('--capture-app')){
 const env={...process.env,QUIET_FIELD_TEST_DATA:path.join(out,'capture-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.argv[2],env});
 try{const page=await app.firstWindow();await page.evaluate(()=>localStorage.setItem('quiet-field-settings',JSON.stringify({locale:'zh-CN',backgroundId:'alpine',mix:{'blanket-waves':.65,'blanket-wind':.2}})));await page.reload();await page.locator('.sound-card').first().waitFor();
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setAudioMuted(true);w.setContentSize(1536,960);w.showInactive();});
 assert.equal(await page.locator('.sound-card').count(),65);await page.getByRole('button',{name:'播放全部',exact:true}).click();await page.getByText('正在准备声音…',{exact:true}).waitFor({state:'hidden'});await page.waitForTimeout(500);
 for(const locale of ['zh-CN','en']){if(locale==='en')await page.getByRole('button',{name:'EN',exact:true}).click();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(root,'site/assets/desktop-'+locale+'.png'),scale:'css'});await fs.copyFile(path.join(root,'site/assets/desktop-'+locale+'.png'),path.join(root,'docs/images/desktop-'+locale+'.png'));}
 console.log('PASS actual public EXE, 65 sounds, ocean mix playback, bilingual screenshots');
 }finally{await app.close();}
}
const remote=process.argv.find(a=>a.startsWith('https://'));let server;
const base=remote||await new Promise(resolve=>{server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');let p=path.resolve(root,'site','.'+u.pathname);assert.ok(p.startsWith(path.join(root,'site')+path.sep)||p===path.join(root,'site'));if((await fs.stat(p)).isDirectory())p=path.join(p,'index.html');const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.ogg':'audio/ogg'};res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port+'/'));});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio']});const checks=[];
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [suffix,lang] of [['','en'],['zh-CN/','zh-CN']]){
  await page.goto(base+suffix);assert.equal(await page.locator('html').getAttribute('lang'),lang);
  assert.match(await page.locator('.primary').getAttribute('href'),/v1\.6\.1\/QuietField-1\.6\.1-Windows-x64-public.zip$/);
  assert.equal(await page.locator('.star-support').getAttribute('href'),'https://github.com/Gary06868/QuietField');assert.equal(await page.locator('.star-support').getAttribute('rel'),'noopener noreferrer');
  assert.match(await page.locator('.facts').innerText(),/1.6.1/);assert.match(await page.locator('.big-number').innerText(),/65/);
  const schema=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());assert.equal(schema.softwareVersion,'1.6.1');
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:980});await page.locator('.screenshot').scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));await page.evaluate(()=>scrollTo(0,0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow '+lang+' '+width);await page.screenshot({path:path.join(out,lang+'-'+width+'.png'),fullPage:true});}
  for(let i=0;i<3;i++){await page.locator('.sample-play').nth(i).click();await page.waitForFunction(i=>document.querySelectorAll('audio')[i].currentTime>.2,i);assert.equal(await page.locator('audio').evaluateAll(a=>a.filter(x=>!x.paused).length),1);}
  await page.locator('.sample-play').nth(2).click();assert.equal(await page.locator('audio').evaluateAll(a=>a.filter(x=>!x.paused).length),0);
  checks.push(lang+': download / star / version / 3 sizes / all 3 real previews');
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,remote?'live-site.json':'local-site.json'),JSON.stringify({passed:true,base,checks,errors},null,2));console.log('PASS',JSON.stringify(checks));
}finally{await browser.close();server?.close();}
