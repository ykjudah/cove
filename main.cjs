const { app, BrowserWindow, session, ipcMain, desktopCapturer, Tray, Menu, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { repository, verifyManifest } = require('./update-security.cjs');
const { checkForAvailableUpdate } = require('./updater-check.cjs');

// Retain the existing installation's login, settings, and updater configuration.
const legacyData = ['PocketChat', 'pocketchat'].map(name => path.join(app.getPath('appData'), name));
app.setPath('userData', legacyData.find(directory => fs.existsSync(directory)) || legacyData[0]);
app.setName('Cove');
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let win, updater, checking = false, timer, signedInOnce=false;
let tray, quitting=false;
function showWindow(){
  if(!win || win.isDestroyed())return;
  if(win.isMinimized())win.restore();
  win.show();win.focus();
}
function setTray(enabled){
  if(process.platform!=='win32')return false;
  if(!enabled){tray?.destroy();tray=null;return false;}
  if(!tray){
    tray=new Tray(path.join(__dirname,'build/icon.png'));
    tray.setToolTip('Cove');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Cove',click:showWindow},{label:'Quit Cove',click:()=>{quitting=true;app.quit();}}]));
    tray.on('click',showWindow);
  }
  return true;
}
app.on('before-quit',()=>{quitting=true;});
let updateState = { version: require('./release-config.json').displayVersion || app.getVersion(), installedVersion: app.getVersion(), repository: '', status: 'Update source not configured', ready: false, busy: false };
const pageUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
function announce(patch) {
  updateState = { ...updateState, ...patch };
  if (win && !win.isDestroyed()) win.webContents.send('updates:state-changed', updateState);
  return updateState;
}
function trusted(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== pageUrl)
    throw new Error('Request not allowed.');
}
function getSource() { return 'https://github.com/ykjudah/cove'; }
function configureUpdates(source) {
  const r = repository(source);
  updater.setFeedURL({ provider: 'github', owner: r.owner, repo: r.repo, private: false });
  announce({ repository: r.url, status: 'Ready to check for updates', ready: false });
}
async function checkUpdates() {
  if (!updater || !updateState.repository || checking || updateState.ready) return updateState;
  checking = true;
  announce({ status: 'Checking for updates…', busy: true });
  try {
    const { result, available } = await checkForAvailableUpdate(updater);
    if (available) {
      verifyManifest(result.updateInfo, fs.readFileSync(path.join(__dirname, 'build/update-public-key.pem')));
      announce({ status: 'Verified update. Downloading…', busy: true });
      await updater.downloadUpdate(); // electron-updater checks the SHA-512 covered by our signature.
    } else {
      const latest = result?.updateInfo?.version;
      announce({ status: latest ? `Cove is up to date (installed ${app.getVersion()}, latest ${latest})` : 'Cove is up to date', busy: false });
    }
  } catch (e) {
    const status = /404|latest release|No published/i.test(e.message) ? 'No published update found yet' : 'Update check failed: ' + e.message.slice(0, 180);
    announce({ status, busy: false, ready: false });
  } finally { checking = false; }
  return updateState;
}
if (locked) app.whenReady().then(() => {
  app.setAppUserModelId('app.pocketchat.desktop');
  // Only the trusted app's top-level document may request camera/microphone.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(
    ['media','display-capture'].includes(permission) && wc === win?.webContents && wc.getURL() === pageUrl &&
    details.isMainFrame === true && details.requestingUrl === pageUrl &&
    (details.mediaTypes || []).every(type => ['audio','video'].includes(type))
  ));
  session.defaultSession.setPermissionCheckHandler((wc, permission, _origin, details) =>
    ['media','display-capture'].includes(permission) && wc === win?.webContents && wc.getURL() === pageUrl &&
    details.isMainFrame === true && (permission === 'display-capture' || ['audio','video','unknown'].includes(details.mediaType))
  );
  win = new BrowserWindow({
    fullscreen: true, width: 1140, height: 780, minWidth: 800, minHeight: 600,
    title: 'Cove', icon: path.join(__dirname, 'build/icon.png'), backgroundColor: '#111419', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling:false }
  });
  win.on('close',event=>{if(tray&&!quitting){event.preventDefault();win.hide();}});
  ipcMain.handle('desktop:tray',(event,enabled)=>{trusted(event);return setTray(enabled===true);});
  ipcMain.handle('desktop:notice',(event,notice)=>{
    trusted(event);
    if(process.platform!=='win32'||!Notification.isSupported()||win.isFocused()||typeof notice?.room!=='string')return;
    const popup=new Notification({title:'Cove',body:notice.call?'Incoming Cove call':'New message in Cove',silent:true,icon:path.join(__dirname,'build/icon.png')});
    popup.on('click',()=>{showWindow();win.webContents.send('desktop:open-room',notice.room);});
    popup.show();
  });
  let pendingCapture = null;
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!request.userGesture || request.frame !== win.webContents.mainFrame || request.frame.url !== pageUrl || pendingCapture) {
      callback(null); return;
    }
    const id = require('node:crypto').randomUUID();
    const finish = source => {
      if (pendingCapture?.id !== id) return;
      clearTimeout(pendingCapture.timer);
      pendingCapture = null;
      if (!win.isDestroyed()) win.webContents.send('capture:closed', id);
      try { callback(source ? {video: source} : null); } catch {}
    };
    pendingCapture = {id, sources: [], finish, timer: setTimeout(()=>finish(null),60000)};
    try {
      const sources = await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:240,height:135}});
      if (pendingCapture?.id !== id) return;
      pendingCapture.sources = sources;
      win.webContents.send('capture:choose', {id,sources:sources.map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}))});
    } catch { finish(null); }
  });
  ipcMain.handle('capture:select', (event, id, sourceId) => {
    trusted(event);
    if (pendingCapture?.id !== id) return;
    pendingCapture.finish(pendingCapture.sources.find(s=>s.id===sourceId) || null);
  });
  win.on('closed',()=>pendingCapture?.finish(null));
  win.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&(input.key==='F11'||(input.key==='Escape'&&win.isFullScreen()))){event.preventDefault();win.setFullScreen(input.key==='F11'?!win.isFullScreen():false);}});
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  if (app.isPackaged && process.platform === 'win32') {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('download-progress', p => announce({ status: `Downloading update… ${Math.round(p.percent)}%`, busy: true }));
    updater.on('update-downloaded', () => announce({ status: 'Update verified. Clearing drafts and restarting…', ready: true, busy: false }));
    updater.on('error', e => announce({ status: 'Update failed: ' + e.message.slice(0, 180), busy: false, ready: false }));
    const source = getSource();
    if (source) configureUpdates(source);
  } else announce({ status: 'Updates are available in the installed Windows app' });
  ipcMain.handle('updates:state', event => { trusted(event); return updateState; });
  ipcMain.handle('updates:source', async event => { trusted(event); return checkUpdates(); });
  ipcMain.handle('updates:signed-in',event=>{trusted(event);if(signedInOnce)return updateState;signedInOnce=true;return checkUpdates();});
  ipcMain.handle('updates:check', event => { trusted(event); return checkUpdates(); });
  ipcMain.handle('updates:install', event => {
    trusted(event);
    if (!updater || !updateState.ready) throw new Error('No verified update is ready.');
    quitting=true;setImmediate(() => updater.quitAndInstall(false, true));
    return true;
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.once('did-finish-load', () => {
    announce({});
    timer = setInterval(() => { if (signedInOnce && updater && updateState.repository) checkUpdates(); }, 4 * 60 * 60 * 1000);
    timer.unref();
  });
});
app.on('second-instance', () => { showWindow(); });
app.on('window-all-closed', () => { clearInterval(timer); app.quit(); });
