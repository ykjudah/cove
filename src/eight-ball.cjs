/* Cove 8-ball. Physics ported from the embedded Scratch project in the supplied
 * "8 Ball Pool.html": Ball physics / Update ball physics, Update part, static and
 * dynamic collision, Edge collision, Hole collision update. See POOL-NOTES.md.
 * Legacy matches retain 340 x 200 geometry; new matches use 400 x 200.
 * No timers or random numbers enter the simulation. One step = one 60 Hz frame.
 */
'use strict';
const LEGACY_HOLES=[[-168,98],[0,102],[168,98],[-168,-98],[0,-102],[168,-98]];
const GEOMETRIES={1:{length:340,diameter:14,railX:163,railY:93,holes:LEGACY_HOLES},2:{length:400,diameter:10.5,railX:194.75,railY:94.75,holes:[[-198,98],[0,102],[198,98],[-198,-98],[0,-102],[198,-98]]}};
GEOMETRIES[3]={...GEOMETRIES[2],capture:11,mouth:11.5};
const geometry=s=>GEOMETRIES[s.version];
const onEight=s=>{const own=s.groups[s.players.indexOf(s.turn)];return !!own&&!s.balls.some(b=>!b.pocketed&&group(b.n)===own);};
function smoothAngle(current,target,dt){const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));return current+delta*(1-Math.exp(-Math.min(dt,100)/38));}
const copy=x=>JSON.parse(JSON.stringify(x));
const group=n=>n===0||n===8?null:n<8?'solids':'stripes';
const distance=(x,y)=>Math.sqrt(x*x+y*y);
const round=n=>Math.round(n*1e9)/1e9;
function initial(players,version=3){
 if(!GEOMETRIES[version])throw Error("Unsupported pool version");
 if(!Array.isArray(players)||players.length!==2||players[0]===players[1]||players.some(p=>typeof p!=='string'))throw Error('Two different players are required.');
 const order=[1,9,2,10,8,3,4,11,5,12,6,7,13,14,15];
 const balls=[{n:0,x:version===1?-85:-106,y:0,vx:0,vy:0,pocketed:false}];let k=0;
 for(let row=0;row<5;row++)for(let col=0;col<=row;col++)balls.push({n:order[k++],x:version===1?59.4+row*12.8:round(82+row*9.3),y:version===1?(col-row/2)*16:round((col-row/2)*10.7),vx:0,vy:0,pocketed:false});
 return {version,players:[...players],turn:players[0],groups:[null,null],ballInHand:false,break:true,winner:null,shotNumber:0,balls,result:'Player 1 breaks'};
}
function validate(s){
 if(!s||!GEOMETRIES[s.version]||!Array.isArray(s.players)||s.players.length!==2||s.players[0]===s.players[1]||!s.players.includes(s.turn)||!Array.isArray(s.balls)||s.balls.length!==16||new Set(s.balls.map(b=>b.n)).size!==16||!Array.isArray(s.groups)||s.groups.length!==2||!((s.groups[0]===null&&s.groups[1]===null)||(s.groups.includes('solids')&&s.groups.includes('stripes')))||typeof s.ballInHand!=='boolean'||typeof s.break!=='boolean'||!Number.isSafeInteger(s.shotNumber)||s.shotNumber<0||(s.winner!==null&&!s.players.includes(s.winner)))throw Error('Invalid pool save.');
 for(const b of s.balls)if(!Number.isInteger(b.n)||b.n<0||b.n>15||typeof b.pocketed!=='boolean'||![b.x,b.y,b.vx,b.vy].every(Number.isFinite)||Math.abs(b.x)>geometry(s).length/2+30||Math.abs(b.y)>130||Math.abs(b.vx)>40||Math.abs(b.vy)>40)throw Error('Invalid ball data.');
 return s;
}
function canPlace(s,x,y){const g=geometry(s);return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<=g.railX&&Math.abs(y)<=g.railY&&g.holes.every(([hx,hy])=>distance(x-hx,y-hy)>=14)&&s.balls.every(b=>!b.n||b.pocketed||distance(x-b.x,y-b.y)>=g.diameter);}
function magnetApplies(run,ball){if(run.shot?.magnetStrength===undefined)return true;const own=run.before.groups[run.before.players.indexOf(run.before.turn)];return !!own&&(group(ball.n)===own||ball.n===8&&onEight(run.before));}
function start(saved,shot,player){
 validate(saved);
 if(saved.winner||saved.turn!==player||saved.balls.some(b=>b.vx||b.vy))throw Error('It is not your turn.');
 if(!shot||!Number.isFinite(shot.angle)||Math.abs(shot.angle)>Math.PI*2||!Number.isFinite(shot.power)||shot.power<.1||shot.power>1)throw Error('Invalid shot.');
 if(shot.magnets!==undefined&&typeof shot.magnets!=='boolean')throw Error('Invalid magnets setting.');
 if(shot.magnetBoost!==undefined&&shot.magnetBoost!==2)throw Error('Invalid magnet boost.');
 if(shot.magnetStrength!==undefined&&(!Number.isFinite(shot.magnetStrength)||shot.magnetStrength<0||shot.magnetStrength>1))throw Error('Invalid magnet strength.');
 if(saved.version<3&&(shot.magnetBoost!==undefined||shot.magnetStrength!==undefined||shot.magnets||shot.calledPocket!==undefined))throw Error('Start a new game for these rules.');
 if(saved.version>=3&&onEight(saved)&&(!Number.isInteger(shot.calledPocket)||shot.calledPocket<0||shot.calledPocket>5))throw Error('Choose a pocket for the 8-ball first.');
 if(shot.calledPocket!==undefined&&(!onEight(saved)||!Number.isInteger(shot.calledPocket)||shot.calledPocket<0||shot.calledPocket>5))throw Error('Invalid called pocket.');
 const s=copy(saved),cue=s.balls.find(b=>b.n===0);
 if(s.ballInHand){if(!shot.cue||!canPlace(s,shot.cue.x,shot.cue.y))throw Error('Place the cue ball in an empty spot.');Object.assign(cue,shot.cue,{pocketed:false});}
 else if(shot.cue)throw Error('Cue placement is not allowed.');
 cue.vx=round(Math.cos(shot.angle)*shot.power*14);cue.vy=round(Math.sin(shot.angle)*shot.power*14);
 return {state:s,before:copy(saved),first:null,pots:[],pockets:{},shot:copy(shot),frames:0,done:false};
}
function step(run){
 if(run.done)return false;
 const bs=run.state.balls,deleted=new Set(),g=geometry(run.state);
 // Original order: friction once per ball, then TWO movement/collision substeps
 // for that ball (not two global sweeps). Stable ball order survives pocketing.
 for(const a of bs){
  if(a.pocketed)continue;
  a.vx+=-a.vx*.02;a.vy+=-a.vy*.02;
  if(run.shot?.magnets&&magnetApplies(run,a)&&(a.vx||a.vy)){let nearest=null,dist=42;for(const [hx,hy]of g.holes){const d=distance(a.x-hx,a.y-hy);if(d>0&&d<dist){dist=d;nearest=[hx,hy];}}if(nearest){const force=.22*(run.shot.magnetStrength??1)*(run.shot.magnetBoost??1)*(1-dist/42);a.vx+=(nearest[0]-a.x)/dist*force;a.vy+=(nearest[1]-a.y)/dist*force;}}
  if(Math.abs(a.vx)<.1&&Math.abs(a.vy)<.1)a.vx=a.vy=0;
  for(let part=0;part<2;part++){
   a.x+=a.vx/2;a.y+=a.vy/2;
   if(!deleted.has(a.n)&&(Math.abs(a.x)>g.length/2-20||Math.abs(a.y)>80)){
    let mouth=false;
    for(let hole=0;hole<g.holes.length;hole++){const [hx,hy]=g.holes[hole],d=distance(a.x-hx,a.y-hy);if(d<(g.capture||13.5)&&!deleted.has(a.n)){deleted.add(a.n);run.pots.push(a.n);(run.pockets||={})[a.n]=hole;}if(d<(g.mouth||14))mouth=true;}
    if(!mouth){if(Math.abs(a.y)>g.railY){a.y=Math.sign(a.y)*g.railY;a.vy=-a.vy;}if(Math.abs(a.x)>g.railX){a.x=Math.sign(a.x)*g.railX;a.vx=-a.vx;}}
   }
   // Source records at most the first overlapping ball per substep.
   for(const b of bs){
    if(a===b||b.pocketed)continue;
    let d=distance(a.x-b.x,a.y-b.y);if(d>=g.diameter)continue;
    if(d===0)throw Error('Overlapping ball centers in saved game.');
    if(run.first===null&&(a.n===0||b.n===0))run.first=a.n===0?b.n:a.n;
    const overlap=(d-g.diameter)/2;
    a.x-=overlap*(a.x-b.x)/d;a.y-=overlap*(a.y-b.y)/d;
    // Sequential updates intentionally match the supplied Scratch blocks.
    b.x+=overlap*(a.x-b.x)/d;b.y+=overlap*(a.y-b.y)/d;
    d=distance(a.x-b.x,a.y-b.y);
    const nx=(a.x-b.x)/d,ny=(a.y-b.y)/d,tx=-ny,ty=nx;
    const t1=a.vx*tx+a.vy*ty,t2=b.vx*tx+b.vy*ty,n1=a.vx*nx+a.vy*ny,n2=b.vx*nx+b.vy*ny;
    // Equal 200-unit masses: swap normal velocity, preserve tangent velocity.
    a.vx=tx*t1+nx*n2;a.vy=ty*t1+ny*n2;b.vx=tx*t2+nx*n1;b.vy=ty*t2+ny*n1;
    break;
   }
  }
 }
 // Stable IDs avoid the original list-index shift when several balls drop.
 for(const b of bs){if(deleted.has(b.n)){b.pocketed=true;b.vx=b.vy=0;}for(const key of ['x','y','vx','vy'])b[key]=round(b[key]);}
 run.frames++;
 if(!bs.some(b=>!b.pocketed&&(b.vx||b.vy))){run.done=true;resolve(run);return false;}
 if(run.frames>3600)throw Error('Shot did not settle. The previous turn has been kept.');
 return true;
}
function resolve(run){
 const s=run.state,before=run.before,i=s.players.indexOf(s.turn),other=s.players[1-i],own=s.groups[i];
 const remaining=before.balls.filter(b=>!b.pocketed&&group(b.n)===own&&own).length;
 const legalFirst=run.first!==null&&(own?(remaining?group(run.first)===own:run.first===8):run.first!==8);
 const foul=run.pots.includes(0)?'Scratch':run.first===null?'No ball hit':!legalFirst?'Wrong ball hit first':null;
 s.shotNumber++;s.break=false;s.ballInHand=false;
 if(run.pots.includes(8)||(own&&remaining===0&&run.pots.includes(0))){
  s.winner=own&&remaining===0&&!foul&&(s.version<3||run.shot?.calledPocket===run.pockets?.[8])?s.turn:other;s.result=s.winner===s.turn?'8-ball pocketed':'8-ball foul';return s;
 }
 if(!foul&&!before.break&&!own){const n=run.pots.find(n=>group(n));if(n){s.groups[i]=group(n);s.groups[1-i]=group(n)==='solids'?'stripes':'solids';}}
 const keep=!foul&&run.pots.some(n=>before.break?!!group(n):group(n)===s.groups[i]&&!!s.groups[i]);
 if(!keep)s.turn=other;
 s.ballInHand=!!foul;s.result=foul?foul+' · ball in hand':keep?'Nice shot · shoot again':'Turn passed';
 if(foul){const cue=s.balls.find(b=>b.n===0);cue.pocketed=false;cue.vx=cue.vy=0;
  // Preview location only; placement must be explicitly confirmed before shooting.
  outer:for(let x=-85;x<=155;x+=15)for(let y=-75;y<=75;y+=15)if(canPlace(s,x,y)){cue.x=x;cue.y=y;break outer;}
 }
 return s;
}
function simulate(saved,shot,player){const run=start(saved,shot,player);while(step(run));return run.state;}
function aim(s,angle){
 const g=geometry(s),cue=s.balls.find(b=>b.n===0),dx=Math.cos(angle),dy=Math.sin(angle);let t=1000,target=null;
 for(const [v,d,limit]of [[cue.x,dx,g.railX],[cue.y,dy,g.railY]])if(Math.abs(d)>1e-9){const q=((d>0?limit:-limit)-v)/d;if(q>=0)t=Math.min(t,q);}
 for(const b of s.balls){if(!b.n||b.pocketed)continue;const bx=b.x-cue.x,by=b.y-cue.y,p=bx*dx+by*dy,disc=g.diameter*g.diameter-(bx*bx+by*by-p*p);if(disc<0||p<0)continue;const q=p-Math.sqrt(disc);if(q>=0&&q<t){t=q;target=b;}}
 return {x:cue.x+dx*t,y:cue.y+dy*t,target};
}
// Visual orientation only; never enters the saved physics state.
function rollFrame(m,dx,dy,radius=7){
 const d=Math.hypot(dx,dy);if(d<1e-10)return m;
 const ax=-dy/d,ay=dx/d,c=Math.cos(d/radius),sn=Math.sin(d/radius),t=1-c;
 const r=[c+ax*ax*t,ax*ay*t,ay*sn,ax*ay*t,c+ay*ay*t,-ax*sn,-ay*sn,ax*sn,c];
 return r.map((_,i)=>{const row=Math.floor(i/3),col=i%3;return r[row*3]*m[col]+r[row*3+1]*m[col+3]+r[row*3+2]*m[col+6];});
}
function cueDeflection(angle,hit){
 if(!hit.target)return null;
 const dx=Math.cos(angle),dy=Math.sin(angle),d=distance(hit.target.x-hit.x,hit.target.y-hit.y),nx=(hit.target.x-hit.x)/d,ny=(hit.target.y-hit.y)/d,dot=dx*nx+dy*ny;
 return {x:dx-nx*dot,y:dy-ny*dot};
}
function trajectory(saved,shot,player){
 const run=start(saved,shot,player),paths=Object.fromEntries(saved.balls.filter(b=>!b.pocketed).map(b=>[b.n,[{x:b.n===0&&shot.cue?shot.cue.x:b.x,y:b.n===0&&shot.cue?shot.cue.y:b.y}]]));let moving=true;
 while(moving){moving=step(run);if(run.frames%2===0||!moving)for(const b of run.state.balls){if(paths[b.n]){const last=paths[b.n].at(-1);if(last.x!==b.x||last.y!==b.y)paths[b.n].push({x:b.x,y:b.y});}}}
 return {paths,first:run.first,end:run.state};
}
// Complete view and controls live in this file. Host supplies authenticated storage.
function mount(root,{state,player,profiles=[],onShot,onRematch,onClose,onDiscard=onClose,isOwner=false,onPreview=()=>{}}){
 let saved=copy(validate(state)),display=copy(saved),angle=0,targetAngle=0,power=.5,busy=false,disposed=false,raf=0,placement=!saved.ballInHand,drag=null,pull=0,lastTime=0,acc=0,run=null,authoritative=null,queued=null,pending=null;
 let visibility=false,trajectoryCache=null,trajectoryKey='',trajectoryAt=-1000;
 let magnets=false,magnetStrength=1,calledPocket=null,remote=null,waitingSync=false,lastPreview=0,previewSequence=Date.now()*100,remoteSequence=-1,lastPreviewShape='';
 root.replaceChildren();
 const el=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text)e.textContent=text;return e;};
 const top=el('div','pool-top'),close=el('button','pool-close','×');close.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';close.type='button';close.setAttribute('aria-label','Close game');close.onclick=onClose;
 const title=el('span','pool-title','8 BALL');top.append(title,close);
 const players=el('div','pool-players'),banner=el('div','pool-banner'),canvas=el('canvas','pool-canvas'),hint=el('p','pool-hint'),actions=el('div','pool-actions');
 banner.setAttribute('role','status');const g=geometry(saved),height=g.length*2.15+230,center=height/2;canvas.width=620;canvas.height=height;canvas.style.aspectRatio=`620/${height}`;canvas.style.width=`min(100%,calc((100dvh - 185px) * 620 / ${height}))`;canvas.setAttribute('aria-label','Pool table. Drag to aim, then pull down the power meter and release to shoot.');canvas.tabIndex=0;
 const discard=el('button','','Discard unsaved shot');discard.onclick=onDiscard;
 const rematch=el('button','primary','Rematch'),retry=el('button','primary','Retry saving shot'),place=el('button','','Place cue ball');
 rematch.onclick=()=>onRematch();retry.onclick=()=>savePending();place.onclick=()=>{placement=false;update();};const magnetButton=el('button','pool-magnets','Magnets: off');magnetButton.type='button';magnetButton.setAttribute('aria-pressed','false');magnetButton.onclick=()=>{if(!editable()||!isOwner)return;magnets=!magnets;magnetButton.textContent='Magnets: '+(magnets?'on':'off');magnetButton.setAttribute('aria-pressed',String(magnets));update();};
 const strengthLabel=el('label','pool-strength','Magnet strength'),strength=el('input',''),strengthValue=el('span','','100%');strength.type='range';strength.min='0';strength.max='100';strength.step='5';strength.value='100';strength.setAttribute('aria-label','Magnet strength');strength.oninput=()=>{magnetStrength=Number(strength.value)/100;strengthValue.textContent=strength.value+'%';};strengthLabel.append(strength,strengthValue);

 const visibilityButton=el('button','pool-visibility','Visibility: off');visibilityButton.type='button';visibilityButton.setAttribute('aria-pressed','false');visibilityButton.onclick=()=>{if(!isOwner||!editable())return;visibility=!visibility;visibilityButton.textContent='Visibility: '+(visibility?'on':'off');visibilityButton.setAttribute('aria-pressed',String(visibility));trajectoryKey='';};
 actions.append(visibilityButton,magnetButton,place,retry,discard,rematch);root.append(top,players,banner,canvas,hint,actions,strengthLabel);
 const rotations=new Map();const texture=document.createElement('canvas');texture.width=texture.height=40;const tc=texture.getContext('2d');let dragStart=null;
 const ctx=canvas.getContext('2d'),colors=['#f3f0e2','#f4d160','#376f94','#d05556','#73577e','#da884b','#538855','#893b42','#101b19'];
 const weave=document.createElement('canvas');weave.width=weave.height=64;const wc=weave.getContext('2d'),pixels=wc.createImageData(64,64);for(let i=0;i<4096;i++){const n=((i*73)^(i>>3)*151)&255;pixels.data.set([n,n,n,255],i*4);}wc.putImageData(pixels,0,0);const feltTexture=ctx.createPattern(weave,'repeat');
 const pos=b=>({x:294+b.y*2.15,y:center-b.x*2.15});
 function editable(){return !busy&&!waitingSync&&!saved.winner&&saved.turn===player&&!pending;}
 function needsPocket(){return saved.version>=3&&onEight(saved)&&calledPocket===null;}
 function update(){
  players.replaceChildren();saved.players.forEach((id,i)=>{const p=profiles.find(p=>p.id===id)||{},box=el('div','pool-player'+(saved.turn===id?' active':''));
   const avatar=el('span','pool-avatar');avatar.dataset.presenceId=id;if(p.avatar){const img=el('img','');img.src=p.avatar;img.alt='';avatar.append(img);}else avatar.textContent=(p.name||'Player')[0].toUpperCase();
   const name=el('strong','',p.name||(id===player?'You':'Opponent')),detail=el('div','pool-player-detail');
   detail.append(name);if(Number.isFinite(p.wins))detail.append(el('small','pool-win-total',p.wins+' wins'));
   if(saved.groups[i]){const badge=el('span','pool-group-ball '+saved.groups[i]);badge.title=saved.groups[i];badge.setAttribute('role','img');badge.setAttribute('aria-label',saved.groups[i]);detail.append(badge);}else detail.append(el('small','','Open table'));
   box.append(avatar,detail);players.append(box);});
  visibilityButton.hidden=!isOwner;visibilityButton.disabled=!editable();magnetButton.hidden=!isOwner||saved.version<3;magnetButton.disabled=!editable();strengthLabel.hidden=!isOwner||saved.version<3;strength.disabled=!editable()||!magnets;hint.classList.toggle('pool-needs-pocket',editable()&&needsPocket());
  banner.textContent=busy?'BALLS IN PLAY':pending?'SHOT NOT SAVED':saved.winner?(saved.winner===player?'YOU WIN.':'YOU LOSE.'):saved.turn===player?(needsPocket()?'CHOOSE YOUR 8-BALL POCKET':'YOUR MOVE.'):'THEIR MOVE.';
  hint.textContent=busy?'':waitingSync?'Waiting for the saved turn…':pending?'Connection interrupted. Retry to send this shot.':saved.winner?saved.result:!editable()?'Waiting for your opponent':saved.ballInHand&&!placement?'Drag the cue ball to an empty spot':saved.version>=3&&onEight(saved)?(calledPocket===null?'Click a glowing pocket on the table to unlock your shot':'Pocket '+(calledPocket+1)+' selected · Aim and shoot'):`${saved.result} · Drag to aim. Pull the stick back or drag the meter to shoot.`;
  rematch.hidden=!saved.winner||!saved.players.includes(player);retry.hidden=!pending||busy;discard.hidden=!pending||busy;place.hidden=!editable()||!saved.ballInHand||!placement;
 }
 function circle(x,y,r,fill,stroke){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
 function line(x,y,xx,yy,color,width=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
 function ball(b,alpha=1){const p=pos(b),radius=g.diameter*2.15/2,r=15;ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x,p.y);ctx.scale(radius/15,radius/15);ctx.translate(-p.x,-p.y);ctx.shadowColor='#001c21aa';ctx.shadowBlur=5;ctx.shadowOffsetY=3;
  circle(p.x,p.y,r,b.n>8?'#eee7d7':colors[b.n]);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  const m=rotations.get(b.n)||[1,0,0,0,1,0,0,0,1];
  if(b.n>8){const pixels=tc.createImageData(40,40),hex=colors[b.n-8],rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
   for(let yy=0;yy<40;yy++)for(let xx=0;xx<40;xx++){const nx=(xx-19.5)/20,ny=(yy-19.5)/20,z2=1-nx*nx-ny*ny;if(z2<0)continue;const z=Math.sqrt(z2),localY=m[1]*nx+m[4]*ny+m[7]*z;if(Math.abs(localY)>.52)continue;const i=(yy*40+xx)*4;pixels.data.set([...rgb,255],i);}
   tc.putImageData(pixels,0,0);ctx.drawImage(texture,p.x-r,p.y-r,r*2,r*2);
  }
  if(b.n){const sign=m[8]>=0?1:-1,nx=m[2]*sign,ny=m[5]*sign,nz=Math.abs(m[8]);
   if(nz>.04){ctx.save();ctx.translate(p.x+nx*r,p.y+ny*r);ctx.rotate(Math.atan2(ny,nx));ctx.scale(nz,1);circle(0,0,6.4,'#fff6e6');ctx.rotate(-Math.atan2(ny,nx)+Math.atan2(m[3],m[0]));ctx.fillStyle='#202328';ctx.font='bold 9px "Avenir Next", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(b.n),0,.5);ctx.restore();}
  }
  const shade=ctx.createRadialGradient(p.x-5,p.y-7,1,p.x+2,p.y+3,19);shade.addColorStop(0,'#ffffff65');shade.addColorStop(.45,'#ffffff00');shade.addColorStop(1,'#00000080');circle(p.x,p.y,r,shade);
  circle(p.x-5,p.y-7,2.2,'#ffffff90');ctx.restore();
 }
 function draw(){
  ctx.clearRect(0,0,620,height);
  const top=center-g.length*2.15/2,bottom=center+g.length*2.15/2;
  // Original table artwork: layered mahogany rails, woven teal felt and soft bevels.
  ctx.save();ctx.shadowColor='#1b201e66';ctx.shadowBlur=15;ctx.shadowOffsetY=7;
  ctx.fillStyle='#7e7c70';ctx.beginPath();ctx.roundRect(49,top-27,490,bottom-top+54,24);ctx.fill();ctx.restore();
  const wood=ctx.createLinearGradient(49,0,539,0);wood.addColorStop(0,'#49302d');wood.addColorStop(.05,'#7e504d');wood.addColorStop(.1,'#573734');wood.addColorStop(.5,'#4d302e');wood.addColorStop(.9,'#69403b');wood.addColorStop(.96,'#8b5a53');wood.addColorStop(1,'#3d2b2a');ctx.fillStyle=wood;ctx.beginPath();ctx.roundRect(51,top-24,486,bottom-top+48,22);ctx.fill();
  for(let i=0;i<16;i++){const x=53+i*1.5;line(x,top+15,x+Math.sin(i)*2,bottom-15,'#e6a89316',.7);line(535-i*1.5,top+15,534-i*1.5,bottom-15,'#e6a89312',.7);}
  for(let j=0;j<12;j++){line(95,top-22+j*1.6,495,top-21+j*1.6,'#d7948218',.7);line(95,bottom+3+j*1.6,495,bottom+4+j*1.6,'#d7948218',.7);}
  ctx.fillStyle='#075650';ctx.fillRect(79,top,430,bottom-top);
  const felt=ctx.createRadialGradient(260,center-100,30,294,center,550);felt.addColorStop(0,'#3b827d');felt.addColorStop(.7,'#3a807a');felt.addColorStop(1,'#34756f');ctx.fillStyle=felt;ctx.fillRect(87,top+8,414,bottom-top-16);
  ctx.save();ctx.beginPath();ctx.rect(87,top+8,414,bottom-top-16);ctx.clip();ctx.globalAlpha=.025;ctx.fillStyle=feltTexture;ctx.fillRect(87,top+8,414,bottom-top-16);ctx.restore();
  ctx.strokeStyle='#033f3b';ctx.lineWidth=7;ctx.strokeRect(82,top+3,424,bottom-top-6);ctx.strokeStyle='#508e85';ctx.lineWidth=3;ctx.strokeRect(87,top+8,414,bottom-top-16);ctx.strokeStyle='#003f3655';ctx.lineWidth=9;ctx.strokeRect(94,top+15,400,bottom-top-30);
  line(92,center+g.length*2.15/4,496,center+g.length*2.15/4,'#9cceb32b');
  for(const x of [65,523])for(const fraction of [1/8,2/8,3/8,5/8,6/8,7/8]){const y=top+(bottom-top)*fraction;ctx.fillStyle='#d5c8af';ctx.beginPath();ctx.moveTo(x,y-3);ctx.lineTo(x+2,y);ctx.lineTo(x,y+3);ctx.lineTo(x-2,y);ctx.fill();}
  for(const x of [190,294,398])for(const y of [top-13,bottom+13])circle(x,y,1.8,'#d5c8af');
  for(const [x,y]of g.holes){const p=pos({x,y});ctx.save();ctx.translate(p.x,p.y);
   const leather=ctx.createRadialGradient(-10,-12,3,0,0,40);leather.addColorStop(0,'#f2efdb');leather.addColorStop(.55,'#cec7b1');leather.addColorStop(1,'#999b85');ctx.fillStyle=leather;
   if(x!==0){ctx.rotate((x>0?(y<0?0:Math.PI/2):(y>0?Math.PI:-Math.PI/2)));ctx.beginPath();ctx.moveTo(-29,29);ctx.lineTo(-29,-12);ctx.quadraticCurveTo(-29,-29,-12,-29);ctx.lineTo(29,-29);ctx.lineTo(29,0);ctx.lineTo(0,29);ctx.closePath();ctx.fill();ctx.rotate(Math.PI/4);ctx.fillStyle='#050b0c';ctx.beginPath();ctx.roundRect(-17,-19,34,38,12);ctx.fill();ctx.fillRect(0,-13,23,26);}
   else{ctx.fillStyle='#bfb49a';ctx.beginPath();ctx.roundRect(-22,-27,44,54,9);ctx.fill();circle(0,0,18,'#050b0c');ctx.fillStyle='#050b0c';ctx.fillRect(y>0?-25:0,-15,25,30);}
   ctx.restore();}

  if(!busy&&!waitingSync&&((editable()&&placement&&!needsPocket())||(!editable()&&remote&&remote.placement))){const c=display.balls.find(b=>!b.n),p=pos(c),hit=aim(display,angle),h=pos(hit);
   line(p.x,p.y,h.x,h.y,'#f6f3dccf',2.6);ctx.lineWidth=2.2;circle(h.x,h.y,g.diameter*2.15/2,null,'#f7f3dfb0');
   if(hit.target){const t=pos(hit.target),d=distance(t.x-h.x,t.y-h.y);line(t.x,t.y,t.x+(t.x-h.x)/d*58,t.y+(t.y-h.y)/d*58,'#fff6dacc',2.6);const def=cueDeflection(angle,hit),length=Math.hypot(def.x,def.y);if(length>.03){const end=pos({x:hit.x+def.x*32,y:hit.y+def.y*32});line(h.x,h.y,end.x,end.y,'#d6edffcc',2.5);circle(end.x,end.y,4,null,'#d6edffcc');}}
   if(isOwner&&visibility&&editable()){
    const shot={angle:Math.atan2(Math.sin(angle),Math.cos(angle)),power:Math.max(.1,power)};if(saved.version>=3){shot.magnets=magnets;if(magnets){shot.magnetStrength=magnetStrength;shot.magnetBoost=2;}if(onEight(saved))shot.calledPocket=calledPocket;}if(saved.ballInHand)shot.cue={x:c.x,y:c.y};
    const key=saved.shotNumber+':'+JSON.stringify({...shot,angle:Math.round(shot.angle*1000)/1000});
    if(key!==trajectoryKey&&lastTime-trajectoryAt>120){trajectoryAt=lastTime;trajectoryKey=key;try{trajectoryCache=trajectory(saved,shot,player);}catch{trajectoryCache=null;}}
    if(trajectoryCache){for(const n of [0,trajectoryCache.first]){const path=trajectoryCache.paths[n];if(!path||path.length<2)continue;ctx.save();ctx.strokeStyle=n===0?'#effaffbb':'#ffdf8fbb';ctx.lineWidth=2.5;ctx.setLineDash([7,5]);ctx.beginPath();path.forEach((b,i)=>{const p=pos(b);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.stroke();ctx.restore();const end=pos(path.at(-1));ctx.lineWidth=2;circle(end.x,end.y,g.diameter*2.15/2,null,n===0?'#effaffaa':'#ffdf8faa');}}
   }
   const dx=-Math.sin(angle),dy=Math.cos(angle),gap=23+pull*60;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(dy,dx));
   const cue=ctx.createLinearGradient(gap,0,gap+195,0);cue.addColorStop(0,'#e7d9a4');cue.addColorStop(.55,'#ba915a');cue.addColorStop(.6,'#56443b');cue.addColorStop(1,'#332c29');ctx.fillStyle=cue;ctx.beginPath();ctx.moveTo(gap,-2);ctx.lineTo(gap+195,-5);ctx.lineTo(gap+195,5);ctx.lineTo(gap,2);ctx.fill();ctx.fillStyle='#7bced7';ctx.fillRect(gap-3,-2,4,4);ctx.restore();
  }
  for(const b of display.balls)if(!b.pocketed)ball(b);
  ctx.fillStyle='#777975';ctx.beginPath();ctx.roundRect(558,280,36,340,18);ctx.fill();const fill=ctx.createLinearGradient(0,300,0,600);fill.addColorStop(0,'#e2b7a0');fill.addColorStop(.6,'#d18c6c');fill.addColorStop(1,'#57382f');ctx.fillStyle=editable()&&!needsPocket()?fill:'#405254';ctx.beginPath();ctx.roundRect(566,292+(1-power)*316,20,power*316,10);ctx.fill();
  for(let i=0;i<8;i++)line(561,305+i*40,566,305+i*40,'#b4c4b870');ctx.fillStyle='#becbc1';ctx.font='11px "Avenir Next", sans-serif';ctx.textAlign='center';ctx.fillText('POWER',576,650);
  if(saved.version>=3&&onEight(saved)&&!busy){g.holes.forEach(([x,y],i)=>{const p=pos({x,y});ctx.lineWidth=calledPocket===i?4:needsPocket()?3:1.5;circle(p.x,p.y,needsPocket()?29+Math.sin(lastTime/180)*3:27,null,calledPocket===i?'#e8d690':needsPocket()?'#f0d78c':'#e8d69066');});}
  if(saved.ballInHand&&editable()){const p=pos(display.balls.find(b=>!b.n)),offset=26+Math.sin(lastTime/180)*4;for(let i=0;i<4;i++){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(i*Math.PI/2);line(offset,0,offset+12,0,'#f4e9bd',2.5);line(offset+12,0,offset+7,-5,'#f4e9bd',2.5);line(offset+12,0,offset+7,5,'#f4e9bd',2.5);ctx.restore();}}
 }
 async function savePending(){if(!pending||busy||disposed)return;busy=true;update();try{const result=await onShot(copy(pending.shot),copy(pending.end),pending.base);if(disposed)return;pending=null;saved=copy(validate(result));display=copy(saved);placement=!saved.ballInHand;}catch(e){if(!disposed)hint.textContent=e.message||'Unable to save shot.';}finally{busy=false;if(!disposed)update();}}
 function finish(){calledPocket=null;remote=null;saved=authoritative?copy(validate(authoritative)):copy(run.state);display=copy(saved);run=null;busy=false;placement=!saved.ballInHand;
  if(pending){pending.end=copy(saved);savePending();}else if(queued){const q=queued;queued=null;receive(q);}update();}
 function animate(now){if(disposed)return;
 if(remote&&now-remote.received>2500&&!busy){remote=null;display=copy(saved);}
 if(editable()&&now-lastPreview>100){const preview={revision:saved.shotNumber,angle:round(Math.atan2(Math.sin(angle),Math.cos(angle))),power,pull,placement,cue:saved.ballInHand?{x:display.balls[0].x,y:display.balls[0].y}:null,calledPocket},shape=JSON.stringify(preview);if(shape!==lastPreviewShape||now-lastPreview>1000){lastPreview=now;lastPreviewShape=shape;onPreview({...preview,sequence:++previewSequence});}}
 if(!busy){angle=smoothAngle(angle,targetAngle,lastTime?now-lastTime:16);}if(run){acc+=Math.min(250,now-lastTime);while(acc>=1000/60&&run){acc-=1000/60;try{const previous=run.state.balls.map(b=>({x:b.x,y:b.y}));const moving=step(run);for(let i=0;i<16;i++){const b=run.state.balls[i];if(!b.pocketed)rotations.set(b.n,rollFrame(rotations.get(b.n)||[1,0,0,0,1,0,0,0,1],b.y-previous[i].y,previous[i].x-b.x,g.diameter/2));}if(!moving){finish();break;}display=run.state;}catch(e){saved=copy(run.before);display=copy(saved);run=null;busy=false;pending=null;update();hint.textContent=e.message;break;}}}lastTime=now;draw();raf=requestAnimationFrame(animate);}
 function point(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*620/r.width,y:(e.clientY-r.top)*height/r.height};}
 canvas.onpointerdown=e=>{if(!editable())return;const p=point(e);canvas.setPointerCapture(e.pointerId);
  if(saved.version>=3&&onEight(saved)){const hole=g.holes.findIndex(([x,y])=>{const h=pos({x,y});return Math.hypot(p.x-h.x,p.y-h.y)<34;});if(hole>=0){calledPocket=hole;update();return;}}
  const cp=pos(display.balls.find(b=>!b.n));if(saved.ballInHand&&(!placement||Math.hypot(p.x-cp.x,p.y-cp.y)<38)){drag='place';dragStart={cue:copy(display.balls.find(b=>!b.n)),placement};moveCue(p);return;}
  if(needsPocket()){update();return;}
  const cuePos=pos(display.balls.find(b=>!b.n)),ux=-Math.sin(angle),uy=Math.cos(angle),along=(p.x-cuePos.x)*ux+(p.y-cuePos.y)*uy,across=Math.abs((p.x-cuePos.x)*uy-(p.y-cuePos.y)*ux);
  drag=p.x>540?'power':along>45&&along<310&&across<65?'stick':'aim';dragStart={x:p.x,y:p.y,power};if(drag!=='aim')targetAngle=angle;if(drag==='power'){power=0;pull=power;}else if(drag==='stick'){pull=power;}else{const c=pos(display.balls.find(b=>!b.n));if(Math.hypot(p.x-c.x,p.y-c.y)>24)targetAngle=Math.atan2(p.x-c.x,c.y-p.y);}
 };
 canvas.onpointermove=e=>{if(!editable()||!drag)return;const p=point(e);if(drag==='place'){moveCue(p);return;}if(drag==='stick'){power=Math.min(1,Math.max(0,dragStart.power+((p.x-dragStart.x)*-Math.sin(angle)+(p.y-dragStart.y)*Math.cos(angle))/110));pull=power;}else if(drag==='power'){power=Math.min(1,Math.max(0,(p.y-280)/340));pull=power;}else{const c=pos(display.balls.find(b=>!b.n));if(Math.hypot(p.x-c.x,p.y-c.y)>24)targetAngle=Math.atan2(p.x-c.x,c.y-p.y);}};
 canvas.onpointerup=()=>{if(!drag)return;if(drag==='place'){drag=null;update();return;}const shoot=drag==='power'||drag==='stick';drag=null;pull=0;if(!shoot||!editable()||!placement||needsPocket()||power<=0)return;
  const shot={angle:round(Math.atan2(Math.sin(angle),Math.cos(angle))),power:round(Math.max(.1,power))};if(saved.version>=3){shot.magnets=isOwner&&magnets;if(shot.magnets){shot.magnetStrength=magnetStrength;shot.magnetBoost=2;}if(onEight(saved))shot.calledPocket=calledPocket;}if(saved.ballInHand){const c=display.balls.find(b=>!b.n);shot.cue={x:c.x,y:c.y};}
  try{run=start(saved,shot,player);onPreview({revision:saved.shotNumber,sequence:++previewSequence,shot});pending={shot,base:saved.shotNumber,end:null};display=run.state;authoritative=null;busy=true;acc=0;update();}catch(e){hint.textContent=e.message;}
 };
 canvas.onpointercancel=()=>{if(drag==='place'){Object.assign(display.balls.find(b=>!b.n),dragStart.cue);placement=dragStart.placement;}drag=null;pull=0;};
 function moveCue(p){const x=round((center-p.y)/2.15),y=round((p.x-294)/2.15);if(canPlace(display,x,y)){Object.assign(display.balls.find(b=>!b.n),{x,y});placement=true;}update();}
 function receivePreview(packet){
  if(disposed||saved.turn===player||saved.winner||pending||packet?.revision!==saved.shotNumber||!Number.isSafeInteger(packet.sequence)||packet.sequence<=remoteSequence)return;
  if(packet.shot){if(busy||waitingSync)return;try{run=start(saved,packet.shot,saved.turn);remoteSequence=packet.sequence;display=run.state;authoritative=null;waitingSync=true;busy=true;acc=0;update();}catch{}return;}
  if(busy||waitingSync||!Number.isFinite(packet.angle)||Math.abs(packet.angle)>Math.PI*2||![packet.power,packet.pull].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||typeof packet.placement!=='boolean')return;
  if(packet.cue&&(!saved.ballInHand||!canPlace(saved,packet.cue.x,packet.cue.y)))return;
  if(packet.calledPocket!==null&&(!Number.isInteger(packet.calledPocket)||packet.calledPocket<0||packet.calledPocket>5))return;
  remoteSequence=packet.sequence;remote={...packet,received:performance.now()};targetAngle=packet.angle;power=packet.power;pull=packet.pull;calledPocket=packet.calledPocket;
  display=copy(saved);if(packet.cue)Object.assign(display.balls[0],packet.cue);
 }

 function receive(packet){if(disposed)return;const end=validate(packet.state);if(end.shotNumber<saved.shotNumber||end.shotNumber===saved.shotNumber&&!waitingSync)return;if(busy){if(end.shotNumber>saved.shotNumber)queued=packet;return;}
  if(waitingSync&&end.shotNumber===saved.shotNumber){waitingSync=false;saved=copy(end);display=copy(end);placement=!saved.ballInHand;remoteSequence=-1;update();return;}
  waitingSync=false;remote=null;remoteSequence=-1;calledPocket=null;if(pending&&end.shotNumber===pending.base+1){pending=null;saved=copy(end);display=copy(end);placement=!saved.ballInHand;update();return;}if(end.shotNumber<=saved.shotNumber)return;
  pending=null;
  if(packet.shot&&end.shotNumber===saved.shotNumber+1){try{run=start(saved,packet.shot,saved.turn);display=run.state;authoritative=copy(end);busy=true;acc=0;update();return;}catch{}}
  saved=copy(end);display=copy(end);placement=!saved.ballInHand;update();
 }
 update();raf=requestAnimationFrame(animate);
 return {receive,receivePreview,setWins(totals){for(const p of profiles)if(totals[p.id])p.wins=totals[p.id].pool;update();},destroy(){disposed=true;cancelAnimationFrame(raf);root.replaceChildren();},isBusy:()=>busy||!!pending,getState:()=>copy(saved)};
}
module.exports={initial,validate,start,step,resolve,simulate,canPlace,aim,mount,group,rollFrame,cueDeflection,geometry,smoothAngle,onEight,magnetApplies,trajectory};
