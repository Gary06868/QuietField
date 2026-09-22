import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const backendURL=new URL('../updates.cjs',import.meta.url);
const desktopURL=new URL('../desktop-updates.cjs',import.meta.url);
const asset={url:'https://github.com/Gary06868/QuietField/releases/download/v1.7.0/QuietField-1.7.0-Windows-x64-public.zip',size:2,sha256:createHash('sha256').update('ab').digest('hex')};
function loadBackend(files,fetcher){
 const context={module:{exports:{}},require:name=>name==='node:fs/promises'?files:require(name),Buffer,URL,AbortController,AbortSignal,setTimeout,clearTimeout,globalThis:{fetch:fetcher}};
 vm.runInNewContext(fs.readFileSync(backendURL,'utf8'),context,{filename:'updates.cjs'});
 return context.module.exports;
}
function fixture(){return {tag_name:'v1.7.0',html_url:'https://github.com/Gary06868/QuietField/releases/tag/v1.7.0',draft:false,prerelease:false,body:'Verified release',assets:[{name:'QuietField-1.7.0-Windows-x64-public.zip',browser_download_url:asset.url,size:asset.size,digest:'sha256:'+asset.sha256,state:'uploaded'}]};}
function memoryFiles(initial){
 const entries=new Map(initial);
 return {entries,readFile:async file=>{if(!entries.has(file))throw Object.assign(new Error('missing'),{code:'ENOENT'});return entries.get(file);},mkdir:async()=>{},writeFile:async(file,data)=>{entries.set(file,data);},rename:async(from,to)=>{entries.set(to,entries.get(from));entries.delete(from);}};
}

test('destination-open failure cancels response and aborts the download request',async()=>{
 let cancelled=false,requestSignal;
 const files={open:async()=>{throw Object.assign(new Error('denied'),{code:'EACCES'});}};
 const backend=loadBackend(files,async(_url,options)=>{requestSignal=options.signal;return new Response(new ReadableStream({cancel(){cancelled=true;}}));});
 await assert.rejects(backend.downloadAsset(asset,'unused.zip',new AbortController().signal),{code:'EACCES'});
 assert.equal(cancelled,true);
 assert.equal(requestSignal.aborted,true);
});

test('cancellation closes and removes a partial download without masking the abort',async()=>{
 const controller=new AbortController();let closes=0,unlinks=0,requestSignal;
 const backend=loadBackend({open:async()=>({writeFile:async()=>controller.abort(),close:async()=>{closes++;}}),unlink:async()=>{unlinks++;}},async(_url,options)=>{
  requestSignal=options.signal;
  return new Response(new ReadableStream({start(stream){stream.enqueue(Buffer.from('a'));stream.enqueue(Buffer.from('b'));stream.close();}}));
 });
 await assert.rejects(backend.downloadAsset(asset,'unused.zip',controller.signal),{name:'AbortError'});
 assert.equal(closes,1);assert.equal(unlinks,1);assert.equal(requestSignal.aborted,true);
});

test('a failed file close cannot prevent partial-download cleanup or hide checksum failure',async()=>{
 let unlinks=0;
 const backend=loadBackend({open:async()=>({writeFile:async()=>{},close:async()=>{throw new Error('close failed');}}),unlink:async()=>{unlinks++;}},async()=>new Response('ab'));
 await assert.rejects(backend.downloadAsset({...asset,sha256:'0'.repeat(64)},'unused.zip',new AbortController().signal),{code:'checksum'});
 assert.equal(unlinks,1);
});

test('offline checks retain cached release and its read state across restart',async()=>{
 const files=memoryFiles([['prefs.json',JSON.stringify({autoCheck:true,lastCheck:0,readVersion:null,release:fixture()})]]);
 const backend=loadBackend(files);
 const fetcher=async()=>{throw new Error('offline');};
 const service=await backend.createUpdateService({version:'1.6.1',prefsPath:'prefs.json',fetcher});
 assert.equal(service.snapshot().unread,true);
 const offline=await service.check(true);
 assert.equal(offline.phase,'error');assert.equal(offline.error,'network');assert.equal(offline.latest.version,'1.7.0');assert.equal(offline.unread,true);
 await service.read();assert.equal(service.snapshot().unread,false);
 const restarted=await backend.createUpdateService({version:'1.6.1',prefsPath:'prefs.json',fetcher});
 assert.equal(restarted.snapshot().latest.version,'1.7.0');assert.equal(restarted.snapshot().unread,false);
});

test('cancel during preparation restores available state and clears failure',async()=>{
 const files=memoryFiles([['prefs.json',JSON.stringify({autoCheck:true,lastCheck:0,readVersion:null,release:fixture()})]]);
 const backend=loadBackend(files);let prepared;
 const preparationStarted=new Promise(resolve=>{prepared=resolve;});
 const service=await backend.createUpdateService({version:'1.6.1',prefsPath:'prefs.json',canInstall:true,installer:async(_release,signal,progress)=>{
  progress('preparing');prepared();await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 }});
 const installing=service.install();await preparationStarted;service.cancel();await installing;
 assert.equal(service.snapshot().phase,'available');assert.equal(service.snapshot().error,null);assert.equal(service.snapshot().latest.version,'1.7.0');
});

function applyHarness({exitCode=null,signalCode=null,resultExists=false,exitDuringRead=false}={}){
 const launch={};const child=new EventEmitter();Object.assign(child,{exitCode,signalCode,unreferenced:false,unref(){this.unreferenced=true;},kill(){throw new Error('Unexpected kill');}});
 const files={readFile:async()=>{if(exitDuringRead)child.exitCode=1;return JSON.stringify({ready:true,ticket:'fixture-ticket'});},access:async()=>{if(!resultExists)throw Object.assign(new Error('missing'),{code:'ENOENT'});}};
 const context={module:{exports:{}},require(name){if(name==='node:fs/promises')return files;if(name==='node:child_process')return{spawn:(...args)=>{launch.args=args;return child;}};if(name==='./updates.cjs')return require('../updates.cjs');return require(name);},setTimeout,clearTimeout,setInterval,clearInterval,process};
 vm.runInNewContext(fs.readFileSync(desktopURL,'utf8')+'\nmodule.exports.reviewStartApply=startApply;',context,{filename:'desktop-updates.cjs'});
 return {child,launch,run:()=>context.module.exports.reviewStartApply('worker.ps1',{jobDir:'job',readyPath:'ready.json',resultPath:'result.json',ticket:'fixture-ticket'},'config.json')};
}
for(const [name,options] of [
 ['helper already exited',{exitCode:1}],
 ['helper terminated by signal',{signalCode:'SIGTERM'}],
 ['terminal result already written',{resultExists:true}],
 ['helper exited while ready marker was read',{exitDuringRead:true}]
])test('stale readiness cannot quit the old app: '+name,async()=>{
 const harness=applyHarness(options);await assert.rejects(harness.run(),{code:'install'});assert.equal(harness.child.unreferenced,false);
});
test('a live ready helper without a terminal result can receive the quit handoff',async()=>{
 const harness=applyHarness();await harness.run();assert.equal(harness.child.unreferenced,true);
});
test('Windows launch uses a normal hidden bootstrap for an independent Apply process',async()=>{
 const harness=applyHarness();await harness.run();
 const [executable,args,options]=harness.launch.args;
 assert.equal(executable,'powershell.exe');
 assert.equal(args[args.indexOf('-Mode')+1],'Launch');
 assert.equal(options.windowsHide,true);
 assert.equal(options.stdio,'ignore');
 assert.notEqual(options.detached,true);
 assert.equal(harness.child.unreferenced,true);
});