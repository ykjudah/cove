const path = require("node:path");
const fixture = "/tmp/sahur-call-ui";
fsSetup();
function fsSetup() {
  const fs = require("node:fs");
  fs.mkdirSync(fixture, { recursive: true });
  require("esbuild").buildSync({
    entryPoints: [path.join(__dirname, "../src/calls.cjs")],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "SahurCalls",
    outfile: fixture + "/calls.js",
  });
  fs.copyFileSync(path.join(__dirname, "../style.css"), fixture + "/style.css");
  fs.writeFileSync(
    fixture + "/index.html",
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body><main class="conversation"><header class="conversation-header">Call test</header><div id="test-history">Chat history</div></main><script src="calls.js"></script></body></html>',
  );
}
const { app, BrowserWindow, ipcMain, session } = require("electron"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
app.commandLine.appendSwitch("use-fake-device-for-media-stream");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let backend,
  windows = [],
  queue = Promise.resolve();
ipcMain.handle("test:rpc", (event, name, args) => {
  const i = windows.findIndex((w) => w.webContents === event.sender);
  const next = queue.then(() => backend.rpc(i, name, args));
  queue = next.catch(() => {});
  return next.then(
    (data) => ({ data }),
    (e) => ({ error: { message: e.message } }),
  );
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (w, code) => w.webContents.executeJavaScript(code, true);
async function until(fn, label) {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await pause(250);
  }
  throw Error("Timed out: " + label);
}
app.whenReady().then(async () => {
  try {
    backend = await require("./live-backend.cjs").create();
    const main = fs.readFileSync(
      require("node:path").join(__dirname, "../main.cjs"),
      "utf8",
    );
    const permissionCode = main.slice(
      main.indexOf("session.defaultSession.setPermissionRequestHandler"),
      main.indexOf("  win = new BrowserWindow"),
    );
    const installPermissions = new Function(
      "session",
      "win",
      "pageUrl",
      permissionCode,
    );
    for (const id of backend.ids.slice(0, 3)) {
      const win = new BrowserWindow({
        width: 1100,
        height: 780,
        show: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          backgroundThrottling: false,
          partition: "call-test-" + id,
        },
      });
      windows.push(win);
      installPermissions(
        { defaultSession: win.webContents.session },
        win,
        "file:///tmp/sahur-call-ui/index.html",
      );
      await win.loadFile("/tmp/sahur-call-ui/index.html");
      await run(
        win,
        `window.isScreen=v=>{if(!v?.videoWidth)return false;const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.drawImage(v,0,0,1,1);const p=x.getImageData(0,0,1,1).data;return p[0]>150&&p[1]<110&&p[2]>70;};window.notices=[];window.captures=0;const portrait=document.createElement('canvas');portrait.width=portrait.height=64;const ctx=portrait.getContext('2d');ctx.fillStyle='#75619a';ctx.fillRect(0,0,64,64);ctx.fillStyle='white';ctx.font='32px sans-serif';ctx.fillText('C',18,45);window.portrait=portrait.toDataURL('image/jpeg');window.fixture={client:{rpc:(name,args)=>require('electron').ipcRenderer.invoke('test:rpc',name,args),functions:{invoke:async()=>({data:{iceServers:[],relay:true}})}},userId:'${id}',label:id=>['Alex','Blair','Casey'][${JSON.stringify(backend.ids)}.indexOf(id)]||'Member',avatar:()=>window.portrait,notify:text=>notices.push(text),mediaDevices:{getDisplayMedia:async()=>{const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const ctx=canvas.getContext('2d');ctx.fillStyle='#cc4477';ctx.fillRect(0,0,960,540);window.sharedCanvas=canvas;window.sharedStream=canvas.captureStream(15);window.sharePaint=setInterval(()=>{ctx.fillStyle='#cc4477';ctx.fillRect(0,0,960,540);},60);sharedStream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(sharePaint));return sharedStream;},getUserMedia:async c=>{captures++;const stream=await navigator.mediaDevices.getUserMedia(c);for(const t of stream.getAudioTracks()){stream.removeTrack(t);t.stop();}window.toneCtx=new AudioContext();await toneCtx.resume();const osc=toneCtx.createOscillator(),dest=toneCtx.createMediaStreamDestination();window.gain=toneCtx.createGain();gain.gain.value=0;osc.connect(gain).connect(dest);osc.start();stream.addTrack(dest.stream.getAudioTracks()[0]);return stream}}};window.controller=SahurCalls.mount(fixture);void 0;`,
      );
    }
    const [a, b, c] = windows;
    await run(a, `controller.start('${backend.room}',true)`);
    const incoming = (w) =>
      run(
        w,
        "!document.querySelector('.call-panel').hidden && !document.querySelector('.call-accept').hidden",
      );
    await until(() => incoming(b), "incoming call");
    assert.equal(await run(b, "captures"), 0);
    assert.equal(await run(a, "captures"), 0);
    await run(b, "document.querySelector('.call-accept').click()");
    await until(() => incoming(c), "third invitation");
    await run(c, "document.querySelector('.call-accept').click()");
    for (const w of windows)
      await until(
        () =>
          run(
            w,
            "[...document.querySelectorAll('.call-remote')].filter(v=>v.videoWidth>0&&v.srcObject?.getAudioTracks().length).length===2",
          ),
        "two remote video + audio streams per participant",
      );
    assert.equal(await run(a,"getComputedStyle(document.querySelector('.conversation-header')).display"),'none');
    await run(a,"document.querySelector('.call-share').click()");
    await until(()=>run(a,"document.querySelector('.call-share').getAttribute('aria-pressed')==='true'"),'screen share enabled');
    await until(()=>run(b,"[...document.querySelectorAll('.call-remote')].some(v=>isScreen(v))"),'remote screen received');
    await run(b,"[...document.querySelectorAll('.call-tile')].find(t=>isScreen(t.querySelector('video'))).click()");
    assert.ok(await run(b,"(()=>{const p=document.querySelector('.participant-focus'),r=p.getBoundingClientRect();return r.width===innerWidth&&r.height===innerHeight&&document.querySelectorAll('.call-tile.focused').length===1})()"),'participant fills app window');
    assert.ok(await run(b,"(()=>{const t=document.querySelector('.call-tile.focused'),v=t.querySelector('video'),r=t.getBoundingClientRect();return Math.abs(r.width/r.height-v.videoWidth/v.videoHeight)<.02})()"),'expanded share keeps its aspect ratio');
    await run(b,"new Promise(r=>setTimeout(r,250))");
    fs.writeFileSync('/tmp/sahur-call-ui/expanded-share.png',(await b.webContents.capturePage()).toPNG());
    await run(b,"document.querySelector('.call-back').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    assert.equal(await run(b,"document.querySelector('.participant-focus')===null"),true);
    await run(a,"document.querySelector('.call-share').click()");
    await until(()=>run(a,"document.querySelector('.call-share').getAttribute('aria-pressed')==='false' && sharedStream.getTracks().every(t=>t.readyState==='ended')"),'share ends and capture stops');
    await until(()=>run(b,"[...document.querySelectorAll('.call-remote')].every(v=>v.videoWidth>0 && !isScreen(v))"),'camera restored');
    assert.ok(await run(b,"document.querySelector('.call-panel').nextElementSibling.id==='test-history' && document.querySelector('.call-panel').getBoundingClientRect().bottom<=document.querySelector('#test-history').getBoundingClientRect().top+1"));
    await run(a,"gain.gain.value=.4;void 0");
    await until(()=>run(b,"document.querySelector('.speaking .call-tile-name')?.textContent==='Alex'"),'speaker outline on remote voice');
    await run(b,"document.querySelector('.call-minimize').click()");
    await until(()=>run(b,"document.querySelector('.current-speaker')?.offsetHeight>0 && !document.querySelector('.current-speaker video').hidden"),'minimized video speaker');
    await run(a,"gain.gain.value=0;void 0");await run(c,"document.querySelector('.call-camera').click();gain.gain.value=.4;void 0");
    await until(()=>run(b,"document.querySelector('.current-speaker .call-tile-name')?.textContent==='Casey' && !document.querySelector('.current-speaker .call-tile-placeholder').hidden && document.querySelector('.current-speaker .call-tile-placeholder img')?.naturalWidth===64"),'minimized camera-off speaker');
    await run(c,"gain.gain.value=0;void 0");await until(()=>run(b,"document.querySelector('.call-panel').dataset.hasSpeaker==='false'"),'silence clears speaker');
    await run(b,"document.querySelector('.call-minimize').click()");
    await run(
      a,
      "window.tracks=document.querySelector('.call-local').srcObject.getTracks();document.querySelector('.call-mic').click();document.querySelector('.call-camera').click()",
    );
    assert.ok(await run(a, "tracks.every(t=>!t.enabled)"));
    await until(
      () =>
        run(
          b,
          "document.querySelector('.call-tile-state[title=\"Microphone muted\"]')!==null",
        ),
      "remote mute indicator",
    );
    await run(b,"new Promise(r=>setTimeout(r,250))");
    assert.ok(await run(b,"(()=>{const tiles=[...document.querySelectorAll('.call-tile')].map(t=>t.getBoundingClientRect());return tiles.every(t=>Math.abs(t.width/t.height-16/9)<.03)&&Math.max(...tiles.map(t=>t.y))-Math.min(...tiles.map(t=>t.y))<2})()"),'grid uses one fitted row without empty cells');
    fs.writeFileSync(
      "/tmp/sahur-call-ui/group-connected.png",
      (await b.webContents.capturePage()).toPNG(),
    );
    await run(b,"[...document.querySelectorAll('.call-tile')].find(t=>t.querySelector('.call-tile-name').textContent==='Casey').click()");
    await run(c, "document.querySelector('.call-end').click()");
    await until(
      () => run(b, "document.querySelectorAll('.call-tile').length===2"),
      "third person leaves",
    );
    assert.equal(await run(b,"document.querySelector('.participant-focus')===null"),true,"leaving focused participant restores grid");
    assert.ok(
      await run(b, "document.querySelector('.call-remote').videoWidth>0"),
    );
    await run(a, "document.querySelector('.call-end').click()");
    assert.ok(await run(a, "tracks.every(t=>t.readyState==='ended')"));
    await run(b, "document.querySelector('.call-end').click()");
    await pause(1700);
    await run(a, `controller.start('${backend.room}',false)`);
    await until(()=>incoming(b),'incoming voice call');
    await run(b,"document.querySelector('.call-accept').click()");
    await until(()=>run(a,"!document.querySelector('.call-share').disabled && document.querySelector('.call-remote')?.srcObject?.getAudioTracks().length>0"),'voice media ready');
    await run(a,"document.querySelector('.call-share').click()");
    await until(()=>run(b,"[...document.querySelectorAll('.call-remote')].some(v=>isScreen(v)&&!v.hidden)"),'screen sharing inside voice call');
    await run(a,"document.querySelector('.call-share').click()");
    await until(()=>run(b,"[...document.querySelectorAll('.call-remote')].every(v=>v.hidden)"),'voice-only avatar restored');
    await run(a,"document.querySelector('.call-end').click()");
    await run(b,"document.querySelector('.call-end').click()");
    console.log(
      "Passed video and voice screen sharing, camera restoration, three-peer call, inline stage placement, remote speech highlight, minimized camera and avatar handoff, silence and hangup.",
    );
    app.exit(0);
  } catch (e) {
    console.error(e);
    for (const w of windows)
      console.error(
        await run(
          w,
          "({notices,captures,status:document.querySelector('.call-status')?.textContent})",
        ),
      );
    app.exit(1);
  }
});
