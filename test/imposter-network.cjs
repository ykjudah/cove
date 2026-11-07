// Electron integration check: delayed replies and a lost acknowledgement must
// preserve inputs made while the previous batch is in flight.
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 let win;
 try{
  const dir=process.env.POCKETCHAT_UI_DIR||'/tmp/cove13-ui';
  require('esbuild').buildSync({stdin:{contents:`import {createScene,outcome} from './src/imposter-scene.js';window.sceneFactory=createScene;window.outcome=outcome;`,resolveDir:process.cwd()},bundle:true,platform:'browser',outfile:path.join(dir,'network.js')});
  fs.writeFileSync(path.join(dir,'network.html'),`<link rel="stylesheet" href="style.css"><style>body{margin:0;background:#111923;padding:20px}.imp-stage{width:900px;height:500px}.imp-world{width:900px;height:500px}dialog{padding:20px;width:960px;background:#202733;border:0}</style><dialog open><div class="imp-stage"></div></dialog><script src="network.js"></script>`);
  win=new BrowserWindow({width:1040,height:700,show:true,webPreferences:{backgroundThrottling:false}});
  await win.loadFile(path.join(dir,'network.html'));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const delay=ms=>new Promise(r=>setTimeout(r,ms));
   const me={uid:'one',x:350,y:94,move_rev:0,room:0,alive:true,role:'Innocent',suit:4,hat:'sprout',todo:[],done:[]},other={...me,uid:'two',x:360,suit:2,hat:'cap'};
   const data={me,players:[me,other],game:{map:'Keel',phase:'play',winner:'Innocent'}};
   let server={x:350,y:94,revision:0},lost=false,requests=0;
   const scene=window.sceneFactory('Keel',data,id=>id,async(rev,steps)=>{
    requests++;await delay(110);
    if(rev===server.revision){for(const [dx,dy] of steps){server.x+=dx;server.y+=dy;}server.revision++;}
    const reply={...server};await delay(130);
    if(!lost){lost=true;return null;}return reply;
   },async()=>[{...other,rev:0,at:0}]);
   document.querySelector('.imp-stage').append(scene.canvas);
   let frames=0;const count=()=>{frames++;if(frames<300)requestAnimationFrame(count);};requestAnimationFrame(count);
   scene.canvas.focus();await delay(200);const hold=setInterval(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'d'})),30);await delay(500);clearInterval(hold);
   window.dispatchEvent(new KeyboardEvent('keyup',{key:'d'}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'}));await delay(400);
   window.dispatchEvent(new KeyboardEvent('keyup',{key:'w'}));await delay(1700);
   const p=scene.position();scene.destroy();
   document.querySelector('dialog').replaceChildren(window.outcome(data,id=>id==='one'?'You':'Alex'));
   return {p,server,requests,lost,frames};
  })()`);
  assert.ok(result.lost&&result.requests>2);assert.ok(Math.abs(result.p.x-result.server.x)<.01&&Math.abs(result.p.y-result.server.y)<.01,JSON.stringify(result));assert.ok(result.server.x>358&&result.server.y<88,JSON.stringify(result));
  await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  fs.writeFileSync(path.join(dir,'imposter-victory.png'),(await win.webContents.capturePage()).toPNG());
  console.log('Delayed/lost acknowledgement movement and victory render passed',JSON.stringify(result));
 }catch(e){console.error(e);process.exitCode=1;}finally{win?.destroy();app.quit();}
});
