const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const security = require('../update-security.cjs');

test('desktop updater rejects unsigned releases before download and protects IPC commands', async () => {
  const directory=path.resolve(__dirname,'..'), handlers=new Map(), app=new EventEmitter(), updater=new EventEmitter();
  const key=crypto.generateKeyPairSync('ed25519');
  const manifest={version:'1.2.0',files:[{url:'PocketChat-1.2.0-Setup-x64.exe',size:123,sha512:crypto.createHash('sha512').update('installer').digest('base64')}]};
  let captureHandler, captureRequest;
  let checks=0, downloads=0, installs=0, currentInfo=structuredClone(manifest), window;
  Object.assign(app,{isPackaged:true,requestSingleInstanceLock:()=>true,quit(){},whenReady:()=>Promise.resolve(),getVersion:()=> '1.1.0',getPath:()=>'/mock-user',setAppUserModelId(){},setPath(name,value){app.savedPath=value;},setName(name){app.savedName=name;}});
  Object.assign(updater,{setFeedURL(){},checkForUpdates:async()=>{checks++;return {isUpdateAvailable:true,updateInfo:currentInfo};},downloadUpdate:async()=>{downloads++;updater.emit('update-downloaded');return ['installer.exe'];},quitAndInstall:()=>{installs++;}});
  class Window extends EventEmitter {
    constructor(options){super();window=this;this.options=options;this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:{url:pathToFileURL(path.join(directory,'index.html')).href},send(name,value){if(name==="capture:choose")captureRequest=value;},setWindowOpenHandler(){}});}
    hide(){this.hidden=true;} show(){this.hidden=false;} isFocused(){return false;} isMinimized(){return false;} focus(){}
    isDestroyed(){return false;}loadFile(){setImmediate(()=>this.webContents.emit('did-finish-load'));}
  }
  const fakeFs={existsSync:()=>false,readFileSync(file){if(file.endsWith('update-public-key.pem'))return key.publicKey.export({type:'spki',format:'pem'});throw Error('No local source');},writeFileSync(){},renameSync(){}};
  let trayInstance,popup;
  class Tray extends EventEmitter{constructor(){super();trayInstance=this;}setToolTip(){}setContextMenu(menu){this.menu=menu;}destroy(){this.destroyed=true;}}
  class Notification extends EventEmitter{static isSupported(){return true;}constructor(options){super();this.options=options;popup=this;}show(){this.shown=true;}}
  const electron={Tray,Notification,Menu:{buildFromTemplate:m=>m},desktopCapturer:{getSources:async()=>[{id:"screen:1",name:"Test screen",thumbnail:{toDataURL:()=>"data:image/png;base64,"}}]},app,BrowserWindow:Window,session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDisplayMediaRequestHandler(handler){captureHandler=handler;}}},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)}};
  const context={require(name){if(name==='electron')return electron;if(name==='electron-updater')return{autoUpdater:updater};if(name==='node:fs')return fakeFs;if(name==='./update-security.cjs')return security;if(name==='./release-config.json')return{repository:'https://github.com/owner/pocketchat'};if(name==='./package.json')return{};return require(name);},__dirname:directory,process:{platform:'win32'},setTimeout,clearTimeout,setImmediate,setInterval:()=>({unref(){}}),clearInterval};
  vm.runInNewContext(fs.readFileSync(path.join(directory,'main.cjs'),'utf8'),context);
  await new Promise(r=>setImmediate(r));
  assert.equal(window.options.fullscreen,true);assert.equal(app.savedName,'Cove');assert.equal(app.savedPath,path.join('/mock-user','PocketChat'));
  assert.equal(checks,0,'no update request before sign-in');
  assert.equal(handlers.get('updates:state')({sender:window.webContents,senderFrame:window.webContents.mainFrame}).repository,'https://github.com/ykjudah/cove');
  const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
  const forgedEvent={sender:window.webContents,senderFrame:{url:'https://evil.test'}};
  assert.equal(handlers.get('desktop:tray')(event,true),true);
  let prevented=false;window.emit('close',{preventDefault:()=>prevented=true});
  assert.ok(prevented && window.hidden);
  handlers.get('desktop:notice')(event,{room:'room-a',call:true});
  assert.ok(popup.shown);assert.equal(popup.options.body,'Incoming Cove call');
  popup.emit('click');assert.equal(window.hidden,false);
  assert.throws(()=>handlers.get('desktop:notice')(forgedEvent,{room:'x'}));
  handlers.get('desktop:tray')(event,false);assert.equal(trayInstance.destroyed,true);
  let captureResult='pending';
  await captureHandler({userGesture:false,frame:window.webContents.mainFrame},value=>captureResult=value);
  assert.equal(captureResult,null,'screen capture requires a user gesture');
  await captureHandler({userGesture:true,frame:window.webContents.mainFrame},value=>captureResult=value);
  assert.equal(captureRequest.sources.length,1);
  assert.throws(()=>handlers.get('capture:select')(forgedEvent,captureRequest.id,'screen:1'));
  handlers.get('capture:select')(event,captureRequest.id,'screen:1');
  assert.equal(captureResult.video.id,'screen:1','only explicitly selected sources are granted');
  assert.throws(()=>handlers.get('updates:state')(forgedEvent));
  const rejected=await handlers.get('updates:source')(event,'https://github.com/owner/pocketchat');
  assert.match(rejected.status,/verified/);assert.equal(downloads,0);assert.equal(rejected.ready,false);
  assert.throws(()=>handlers.get('updates:signed-in')(forgedEvent));
  await handlers.get('updates:signed-in')(event);const afterSignIn=checks;await handlers.get('updates:signed-in')(event);assert.equal(checks,afterSignIn,'startup check happens once');assert.equal(afterSignIn,2);
  currentInfo={...manifest,pocketchatSignature:crypto.sign(null,security.manifestPayload(manifest),key.privateKey).toString('base64')};
  const ready=await handlers.get('updates:check')(event);
  assert.equal(ready.ready,true);assert.equal(downloads,1);
  assert.throws(()=>handlers.get('updates:install')(forgedEvent));
  handlers.get('updates:install')(event);await new Promise(r=>setImmediate(r));assert.equal(installs,1);
});
