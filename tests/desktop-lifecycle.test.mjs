import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const companionUrl = new URL('../desktop-companion.cjs',import.meta.url);
const companionSource = readFileSync(companionUrl,'utf8');
const companionRequire = createRequire(companionUrl);

function createHarness(t,{prefs={},trayUnavailable=false}={}) {
  const windows = [],trays = [],handlers = new Map();
  const ipcMain = new EventEmitter();
  ipcMain.handle = (channel,handler) => handlers.set(channel,handler);
  ipcMain.removeHandler = channel => handlers.delete(channel);

  class FakeWindow extends EventEmitter {
    constructor(options={}) {
      super();
      this.visible = options.show === true;
      this.destroyed = false;
      this.showCalls = 0;
      this.focusCalls = 0;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = {};
      this.webContents.send = () => {};
      this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    isDestroyed() {return this.destroyed;}
    isMinimized() {return false;}
    getBounds() {return {x:0,y:0,width:1000,height:800};}
    show() {assert.equal(this.destroyed,false);this.visible=true;this.showCalls++;}
    hide() {assert.equal(this.destroyed,false);this.visible=false;}
    focus() {assert.equal(this.destroyed,false);this.focusCalls++;}
    loadURL(url) {this.url=url;return Promise.resolve();}
    destroy() {
      if(this.destroyed)return;
      this.destroyed=true;
      this.visible=false;
      this.emit('closed');
    }
  }
  class FakeTray extends EventEmitter {
    constructor() {super();if(trayUnavailable)throw Error('Tray unavailable');this.destroyed=false;trays.push(this);}
    setToolTip(value) {this.tooltip=value;}
    setContextMenu(value) {this.menu=value;}
    destroy() {this.destroyed=true;}
  }
  const electron = {
    BrowserWindow:FakeWindow,Tray:FakeTray,ipcMain,
    Menu:{buildFromTemplate:template=>template},
    nativeImage:{createFromPath:()=>({resize:()=>({})})},
    screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})},
  };
  const module = {exports:{}};
  const require = id => {
    if(id === 'electron')return electron;
    // Production preferences stay completely isolated from the user's disk.
    if(id === 'node:fs')return {readFileSync:()=>JSON.stringify(prefs),writeFileSync:(_path,text)=>{prefs=JSON.parse(text);}};
    return companionRequire(id);
  };
  vm.runInNewContext(companionSource,{
    module,require,console,process:{platform:process.platform},
    __dirname:path.dirname(fileURLToPath(companionUrl)),
  },{filename:fileURLToPath(companionUrl)});

  const app = new EventEmitter();
  app.getPath = () => 'in-memory-user-data';
  app.quit = () => app.emit('before-quit');
  const main = new FakeWindow({show:true});
  const companion = module.exports(app,main,'in-memory-dist');
  let disposed = false;
  const dispose = () => {if(!disposed){disposed=true;companion.dispose();}};
  t.after(dispose);
  return {
    main,windows,trays,ipcMain,handlers,app,companion,dispose,prefs:()=>prefs,
    action(value) {
      ipcMain.emit('companion-action',{
        sender:main.webContents,
        senderFrame:main.webContents.mainFrame,
      },value);
    },
    visibility() {return {main:main.visible,mini:windows[1]?.visible??false};},
  };
}

test('a delayed mini load does not override a newer full-window request',t=>{
  const h=createHarness(t);
  h.action('mini');
  const mini=h.windows[1];
  assert.equal(mini.url,'quiet://app/index.html#mini');
  assert.deepEqual(h.visibility(),{main:true,mini:false},'main remains usable while mini loads');

  h.companion.showMain();
  const showCalls=h.main.showCalls;
  mini.emit('ready-to-show');

  assert.deepEqual(h.visibility(),{main:true,mini:false});
  assert.equal(h.main.showCalls,showCalls,'late readiness does not refocus the main window');
  assert.equal(mini.showCalls,0);
});

test('closing the main window hides both windows by default, with an accessible tray',t=>{
 const h=createHarness(t);h.action('mini');h.windows[1].emit('ready-to-show');
 let prevented=false;h.main.emit('close',{preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.deepEqual(h.visibility(),{main:false,mini:false});
 assert.equal(h.main.destroyed,false);assert.equal(h.trays[0].destroyed,false);
 h.trays[0].emit('click');assert.equal(h.main.visible,true);
});

test('explicit quit is never intercepted by close-to-tray',t=>{
 const h=createHarness(t);h.app.quit();let prevented=false;
 h.main.emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,false);
});

test('close preference persists with the pin setting and rejects untrusted senders',async t=>{
 const h=createHarness(t,{prefs:{pinned:true}}),set=h.handlers.get('companion-preferences');
 assert.equal(typeof set,'function');
 const trusted={sender:h.main.webContents,senderFrame:h.main.webContents.mainFrame};
 assert.equal(await set({},false),null);assert.equal(h.prefs().closeToTray,undefined);
 const result=await set(trusted,false);assert.equal(result.closeToTray,false);assert.equal(h.prefs().pinned,true);
 let prevented=false;h.main.emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,false);
 h.action('pin');assert.deepEqual(h.prefs(),{pinned:false,closeToTray:false});
 assert.equal((await set(trusted,true)).closeToTray,true);
});

test('a saved quit preference is respected before the renderer is ready',t=>{
 const h=createHarness(t,{prefs:{closeToTray:false}});let prevented=false;
 h.main.emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,false);
});

test('when tray creation fails, closing minimizes instead of making the app unreachable',t=>{
 const h=createHarness(t,{trayUnavailable:true});let minimized=false,prevented=false;
 h.main.minimize=()=>{minimized=true;};h.main.emit('close',{preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(minimized,true);assert.equal(h.main.destroyed,false);
});

test('a delayed mini load preserves a newer hide-to-tray request',t=>{
  const h=createHarness(t);
  h.action('mini');
  const mini=h.windows[1];
  h.action('tray');
  assert.deepEqual(h.visibility(),{main:false,mini:false});

  mini.emit('ready-to-show');

  assert.deepEqual(h.visibility(),{main:false,mini:false});
  assert.equal(h.main.showCalls,0);
  assert.equal(mini.showCalls,0);
  assert.equal(h.trays[0].destroyed,false,'the tray remains available to restore playback controls');
});

test('a mini that finished loading in the background can be reopened and reused',t=>{
  const h=createHarness(t);
  h.action('mini');
  const mini=h.windows[1];
  h.action('main');
  mini.emit('ready-to-show');
  assert.deepEqual(h.visibility(),{main:true,mini:false});

  h.action('mini');
  assert.equal(h.windows.length,2,'reopening reuses the existing mini window');
  assert.deepEqual(h.visibility(),{main:false,mini:true});
  assert.equal(mini.focusCalls,1);

  h.action('tray');
  assert.deepEqual(h.visibility(),{main:false,mini:false});
  h.action('mini');
  assert.deepEqual(h.visibility(),{main:false,mini:true});
  assert.equal(h.windows.length,2);
  assert.equal(mini.focusCalls,2);
});

test('disposing a loading or visible mini never reopens the main window',t=>{
  for(const loaded of [false,true]) {
    const h=createHarness(t);
    h.action('mini');
    const mini=h.windows[1];
    if(loaded)mini.emit('ready-to-show');
    // The hidden main can be closing while a mini load/event is still in flight.
    h.main.hide();
    const showCalls=h.main.showCalls;
    h.dispose();

    assert.equal(mini.isDestroyed(),true);
    assert.equal(h.trays[0].destroyed,true);
    assert.deepEqual(h.visibility(),{main:false,mini:false});
    assert.equal(h.handlers.has('companion-state'),false);
    for(const channel of ['companion-action','companion-command','companion-update']) {
      assert.equal(h.ipcMain.listenerCount(channel),0);
    }
    assert.equal(h.app.listenerCount('before-quit'),0);

    mini.emit('ready-to-show');
    mini.webContents.emit('render-process-gone');
    h.companion.showMain();
    h.action('mini');

    assert.equal(h.main.showCalls,showCalls,'late callbacks cannot reopen main during disposal');
    assert.deepEqual(h.visibility(),{main:false,mini:false});
    assert.equal(h.windows.length,2,'disposed IPC handlers cannot create another mini');
  }
});
