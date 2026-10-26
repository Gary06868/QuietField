import test from 'node:test';import assert from 'node:assert/strict';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
test('focus rest cycles, pause and resume never advance while paused',async t=>{
 const {FocusTimer}=await import('../src/focus-timer.js');t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const changes=[];
 const timer=new FocusTimer({onChange:s=>changes.push(s),canRun:()=>true});t.after(()=>timer.dispose());timer.start({focusMinutes:1,restMinutes:1});
 t.mock.timers.tick(60000);assert.equal(timer.snapshot().phase,'rest');assert.equal(timer.snapshot().cycle,1);
 timer.pause();const remaining=timer.snapshot().remainingMs;t.mock.timers.tick(600000);assert.equal(timer.snapshot().phase,'rest');assert.equal(timer.snapshot().remainingMs,remaining);
 timer.resume();t.mock.timers.tick(60000);assert.equal(timer.snapshot().phase,'focus');assert.equal(timer.snapshot().cycle,2);timer.stop();t.mock.timers.tick(600000);assert.equal(timer.snapshot().status,'idle');
});
test('focus reconciles a long device sleep once and sleep expiry blocks any new phase',async t=>{
 const {FocusTimer}=await import('../src/focus-timer.js');t.mock.timers.enable({apis:['Date','setTimeout'],now:0});let allowed=true;const timer=new FocusTimer({canRun:()=>allowed});t.after(()=>timer.dispose());
 timer.start({focusMinutes:25,restMinutes:5});t.mock.timers.setTime(95*60000);timer.reconcile();assert.equal(timer.snapshot().phase,'focus');assert.equal(timer.snapshot().cycle,4);assert.equal(timer.snapshot().remainingMs,20*60000);
 allowed=false;t.mock.timers.tick(20*60000);assert.equal(timer.snapshot().status,'idle');
});
test('backup roundtrip retains 121 old mixes, rejects corrupt structure and does not overwrite conflicts',async()=>{
 const {exportBackup,parseBackup,mergeBackup}=await import('../src/backup.js');const {normalizeSettings}=await import('../src/settings.js');
 const current=normalizeSettings({saved:Array.from({length:121},(_,i)=>({id:'a'+i,name:'Mix '+i,mix:{rain:.5}})),favorites:['rain']});assert.equal(current.saved.length,121);
 const parsed=parseBackup(exportBackup(current));assert.equal(parsed.saved.length,121);
 const incoming={...parsed,saved:[{id:'a0',name:'Different',mix:{wind:.2}},{id:'new',name:'New',mix:{rain:.7}}]};const merged=mergeBackup(current,incoming,{makeId:()=> 'unique'});
 assert.equal(merged.saved.length,123);assert.equal(merged.saved[0].name,'Mix 0');assert.equal(merged.conflicts,1);
 assert.throws(()=>parseBackup('{'));assert.throws(()=>parseBackup(JSON.stringify({format:'quiet-field-backup',version:1,saved:[{id:'x',name:'x',mix:{rain:Infinity}}],favorites:[]})));
 assert.throws(()=>parseBackup('{"format":"quiet-field-backup","version":1,"saved":[{"id":"x","name":"x","mix":{"__proto__":1}}],"favorites":[]}'));
 assert.throws(()=>parseBackup(JSON.stringify({format:'quiet-field-backup',version:99,saved:[],favorites:[]})));
});
test('backup quota failure is atomic and undo reservation cannot be consumed by a merge',async()=>{
 const {commitBackup,mergeBackup}=await import('../src/backup.js');const current={saved:[{id:'a',name:'A',mix:{rain:.4}}],favorites:['rain']};const incoming={saved:[{id:'b',name:'B',mix:{wind:.5}}],favorites:['wind']};let stored='old';
 assert.throws(()=>commitBackup({setItem(){throw Error('quota');}},current,incoming),/quota/);assert.equal(current.saved.length,1);assert.deepEqual(current.favorites,['rain']);
 const result=commitBackup({setItem(k,v){stored=v;}},current,incoming);assert.equal(result.saved.length,2);assert.equal(JSON.parse(stored).saved.length,2);
 const full={saved:Array.from({length:999},(_,i)=>({id:'x'+i,name:'X',mix:{rain:1}})),favorites:[]};assert.throws(()=>mergeBackup(full,incoming,{reserve:1}));assert.equal(full.saved.length,999);
});
test('focus and tone settings migrate safely with bounded configuration',async()=>{
 const {normalizeSettings}=await import('../src/settings.js');const s=normalizeSettings({tone:'invalid',focus:{focusMinutes:0,restMinutes:999}});assert.equal(s.tone,'natural');assert.deepEqual(s.focus,{focusMinutes:25,restMinutes:5});
});

test('re-importing an already copied conflict is idempotent',async()=>{const {mergeBackup}=await import('../src/backup.js');const current={saved:[{id:'same',name:'Original',mix:{rain:.4}}],favorites:[]},incoming={saved:[{id:'same',name:'Changed',mix:{wind:.3}}],favorites:[]};const first=mergeBackup(current,incoming,{makeId:()=> 'first'}),second=mergeBackup(first,incoming,{makeId:()=> 'second'});assert.equal(first.saved.length,2);assert.equal(second.saved.length,2);assert.equal(second.skipped,1);});
