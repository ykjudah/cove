import {maps,corridorPoints} from './imposter-layout.js';
export const suits=['#ec6558','#77bd86','#70a9df','#ecba58','#b693e4','#f38ead','#65cfc5','#e5e9ef','#c78756','#90a761','#8998bf','#e8a395'];
const radius=11, speed=26;
const corridorCache=new WeakMap();
function segments(map){if(!corridorCache.has(map))corridorCache.set(map,map.routes.flatMap(edge=>{const p=corridorPoints(map,edge);return p.slice(1).map((b,i)=>[['',...p[i]],['',...b]]);}));return corridorCache.get(map);}
function distanceToSegment(x,y,a,b){
 const dx=b[1]-a[1],dy=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[1])*dx+(y-a[2])*dy)/(dx*dx+dy*dy)));
 return Math.hypot(x-a[1]-t*dx,y-a[2]-t*dy);
}
export function floorAt(map,x,y,furniture=true){
 for(let i=0;i<map.rooms.length;i++){const [,cx,cy,w,h]=map.rooms[i],dx=Math.abs(x-cx),dy=Math.abs(y-cy);
  if(dx<=w/2+.001 && dy<=h/2+.001 && dx+dy<=w/2+h/2-5+.001){
   if(furniture && i===0 && ((Math.abs(x-cx)-w*.26)/(w*.093))**2+((y-cy-h*.18)/(h*.075))**2<1)return -2;
   if(furniture && i>0 && Math.abs(x-cx)<6 && Math.abs(y-(cy-h*.24))<2)return -2;
   return i;
  }}
 return segments(map).some(([a,b])=>distanceToSegment(x,y,a,b)<=radius+.001)?-1:-2;
}
function clearStep(map,x,y){return [[0,0],[-2,0],[2,0],[0,-2],[0,2]].every(([a,b])=>floorAt(map,x+a,y+b)!==-2);}
function round(c,x,y,w,h,r,fill,stroke){
 c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.stroke();}
}
function poly(c,pts,fill){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();}
function roomPath(c,r){
 const [,x,y,w,h]=r,l=x-w/2,t=y-h/2,d=6;c.beginPath();
 [[l+d,t],[l+w-d,t],[l+w,t+d],[l+w,t+h-d],[l+w-d,t+h],[l+d,t+h],[l,t+h-d],[l,t+d]].forEach(([a,b],i)=>i?c.lineTo(a,b):c.moveTo(a,b));c.closePath();
}
function route(c,map,edge,width,color){
 const pts=corridorPoints(map,edge);c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.lineJoin='round';c.lineWidth=width;c.strokeStyle=color;c.stroke();
}
function terminal(c,x,y,w=13){
 c.lineWidth=.65;round(c,x,y,w,8,1.1,'#25373e','#11242a');round(c,x+1,y+.9,w-2,4,.6,'#487581');
 c.fillStyle='#9fe2d1';c.fillRect(x+2,y+2,w*.46,.6);c.fillRect(x+2,y+3.2,w*.26,.55);
 for(let i=0;i<4;i++)c.fillRect(x+2+i*1.9,y+6,1,.65);
}
function table(c,x,y,r){
 c.fillStyle='#24343d';c.beginPath();c.ellipse(x,y+2,r+1,r*.64,0,0,7);c.fill();
 c.fillStyle='#65868d';c.beginPath();c.ellipse(x,y,r,r*.64,0,0,7);c.fill();c.strokeStyle='#293e45';c.lineWidth=.7;c.stroke();
 c.fillStyle='#d6ceb8';c.fillRect(x-2,y-1.3,3,2);c.fillStyle='#4d676c';c.fillRect(x+2,y+.2,1,1);
}
function decorate(c,r,i,mapName){
 const [name,x,y,w,h]=r,l=x-w/2,t=y-h/2;
 c.save();roomPath(c,r);c.clip();
 const floor=mapName==='Caldera'?['#73656b','#4e4955']:mapName==='Frostline'?['#7d9098','#536670']:['#718990','#4a626a'];
 const g=c.createLinearGradient(l,t,l+w,t+h);g.addColorStop(0,floor[0]);g.addColorStop(1,floor[1]);c.fillStyle=g;c.fillRect(l,t,w,h);
 c.lineWidth=.45;
 for(let j=0;j<w;j+=11)for(let k=0;k<h;k+=9){const px=l+j,py=t+k;c.strokeStyle='#293b4559';c.strokeRect(px,py,11,9);c.fillStyle='#e0f2ef75';c.fillRect(px+.6,py+.6,9,.28);c.fillStyle='#334954';c.fillRect(px+1,py+1,.42,.42);}
 c.fillStyle='#172936';c.fillRect(l,t,w,5.8);c.fillStyle='#405964';c.fillRect(l+1,t+1.1,w-2,3.2);
 for(let j=8;j<w-6;j+=16){c.fillStyle='#bce3db';c.fillRect(l+j,t+2,6,.9);}
 if(i===0){table(c,l+24,t+21,8);table(c,l+w-23,t+21,8);table(c,l+27,t+h-17,7);terminal(c,x-7,t+6,16);}
 else if(name==='Electrical'||/Dynamo|Kiln|Drill|Pump/.test(name)){
  for(let j=0;j<3;j++){terminal(c,l+7+j*15,t+8);round(c,l+6+j*14,t+h-12,11,7,.8,'#3b4a4e','#243036');for(let q=0;q<4;q++){c.fillStyle=q===2?'#efbd71':'#718285';c.fillRect(l+7+j*14+q*2,t+h-10,1,3);}}
  for(let j=0;j<3;j++){c.strokeStyle=['#d39263','#669da7','#c6b781'][j];c.lineWidth=.65;c.beginPath();c.moveTo(l+8,t+17+j);c.lineTo(l+8,t+h-16+j);c.lineTo(l+25,t+h-16+j);c.stroke();}
 }else if(/Orchard|Reservoir|Weather/.test(name)){
  for(let j=0;j<3;j++){const px=l+10+j*11;round(c,px,t+9,7,13,2,'#20383f','#91aaa4');c.fillStyle='#6eab94';c.beginPath();c.ellipse(px+3.5,t+14,2.5,4,0,0,7);c.fill();}
  terminal(c,l+w-21,t+9);
 }else{
  terminal(c,l+7,t+9,20);terminal(c,l+w-24,t+8,15);
  for(let j=0;j<2;j++){const xx=l+8+j*12;round(c,xx,t+h-13,9,7,.8,'#857a64','#3b4244');c.strokeStyle='#beaf8c';c.strokeRect(xx+1,t+h-12,7,5);}
 }
 c.fillStyle='#172d37';c.fillRect(l+5,t+h-5,w-10,3);c.fillStyle='#afccb8';c.fillRect(l+7,t+h-4,w*.18,.6);
 c.font='bold 3.6px sans-serif';c.textAlign='center';c.fillStyle='#e1efe096';c.fillText(name.toUpperCase(),x,t+h-8);
 c.restore();
}
function makeWorld(map,name,atlas,stations){
 const tex=document.createElement('canvas');const scale=4;tex.width=710*scale;tex.height=410*scale;
 const c=tex.getContext('2d');c.scale(scale,scale);c.fillStyle='#142029';c.fillRect(0,0,710,410);
 for(const edge of map.routes)route(c,map,edge,27,'#0d1b22');
 for(const r of map.rooms){roomPath(c,r);c.lineWidth=5;c.strokeStyle='#101c23';c.stroke();}
 for(const edge of map.routes){route(c,map,edge,23,'#344b54');route(c,map,edge,20,'#728790');route(c,map,edge,17,'#526971');
  c.setLineDash([.5,3]);route(c,map,edge,16,'#698087');c.setLineDash([]);}
 map.rooms.forEach((r,i)=>{
   decorate(c,r,i,name);
   const special={Keel:'Beacon',Caldera:'Survey',Frostline:'Drill bay'}[name];
   const cell=i===0?0:r[0]==='Electrical'?1:r[0]===special?2:-1;
   const equipment={Turbines:0,Array:1,Freight:2,Dynamo:3,Dock:7,Ballast:8,Depot:2,Kiln:3,Survey:1,Ridgeline:6,Quarry:5,'Pump house':3,Courtyard:6,'Weather mast':6,Dispatch:7,'Ice tunnel':8,Archive:7,Reservoir:8};
   const tile=cell>=0?['Keel','Caldera','Frostline'].indexOf(name)*3+cell:equipment[r[0]];
   const art=cell>=0?atlas:stations;
   if(art && tile!==undefined){
    const row=Math.floor(tile/3),sw=art.naturalWidth/3,sh=art.naturalHeight/3;
    c.save();roomPath(c,r);c.clip();c.drawImage(art,(tile%3)*sw+2,row*sh+2,sw-4,sh-4,r[1]-r[3]/2,r[2]-r[4]/2,r[3],r[4]);c.restore();
    if(i===0){
     // Clear the baked table illustration so raised, depth-sorted furniture has
     // one silhouette and the floor remains visible behind walking crew.
     c.save();roomPath(c,r);c.clip();
     c.drawImage(art,(tile%3)*sw+sw*.43,row*sh+sh*.43,sw*.14,sh*.1,r[1]-r[3]*.46,r[2],r[3]*.92,r[4]*.44);
     c.strokeStyle='#35424a44';c.lineWidth=.35;
     for(let yy=r[2]+8;yy<r[2]+r[4]*.43;yy+=10){c.beginPath();c.moveTo(r[1]-r[3]*.46,yy);c.lineTo(r[1]+r[3]*.46,yy);c.stroke();}c.restore();
    }
   }
  });
 // Door thresholds show where each chamber opens onto its corridor.
 for(const pair of map.routes)for(const [a,b] of [[+pair[0],+pair[1]],[+pair[1],+pair[0]]]){
  const r=map.rooms[a],pts=corridorPoints(map,pair),dest=a===+pair[0]?pts[1]:pts.at(-2),dx=dest[0]-r[1],dy=dest[1]-r[2],f=Math.min(r[3]/2/Math.max(.01,Math.abs(dx)),r[4]/2/Math.max(.01,Math.abs(dy)));
  c.save();c.translate(r[1]+dx*f,r[2]+dy*f);c.rotate(Math.atan2(dy,dx));round(c,-8,-11,16,22,.5,'#556975');c.fillStyle='#85989e';c.fillRect(-4,-6,.75,12);c.fillRect(1,-6,.75,12);for(const yy of [-8,6])round(c,-2.5,yy,5,1.8,.4,'#bcf0dd');c.restore();
 }
 return tex;
}
function raisedConsole(c,x,y,marked){
 c.save();c.translate(x,y);c.lineWidth=.55;c.strokeStyle='#152b36';
 c.fillStyle='#07141d55';c.beginPath();c.ellipse(1,1,7.4,2.5,0,0,7);c.fill();
 poly(c,[[-6,-1],[6,-1],[6,1.5],[-6,1.5]],'#334a57');c.stroke();
 poly(c,[[6,-1],[7,-3],[7,-.5],[6,1.5]],'#243c48');c.stroke();
 poly(c,[[-6,-1],[-5,-5],[7,-5],[6,-1]],'#79919b');c.stroke();
 poly(c,[[-4.5,-2],[-4,-4.4],[5.5,-4.4],[5,-2]],'#243c47');c.stroke();
 c.strokeStyle=marked?'#f4d28b':'#90cbd0';c.lineWidth=.35;c.beginPath();c.moveTo(-3.5,-3);c.lineTo(-1.5,-3);c.lineTo(-.7,-3.7);c.lineTo(.2,-2.8);c.lineTo(3.8,-2.8);c.stroke();
 for(let j=0;j<4;j++){c.fillStyle=j===0?'#8ed9bf':'#728c98';c.fillRect(-4+j*2.2,.1,1.3,.45);}
 if(marked){c.strokeStyle='#ffd175';c.lineWidth=.4;c.strokeRect(-7,-6,15,8);}
 c.restore();
}
function raisedTable(c,x,y,r){
 c.save();c.fillStyle='#07141d66';c.beginPath();c.ellipse(x+1,y+2,r+1,r*.49,0,0,7);c.fill();
 // The front apron and pedestal establish the same depth as the crew sprites.
 round(c,x-2,y-1,4,3,1,'#273c46','#11232d');
 c.beginPath();c.ellipse(x,y-1,r,r*.47,0,0,Math.PI);c.lineTo(x-r,y-4);c.ellipse(x,y-4,r,r*.47,0,Math.PI,0,true);c.closePath();c.fillStyle='#263f50';c.fill();c.lineWidth=.65;c.strokeStyle='#152b38';c.stroke();
 c.beginPath();c.ellipse(x,y-4,r,r*.47,0,0,7);c.fillStyle='#5b8497';c.fill();c.stroke();
 c.beginPath();c.ellipse(x,y-4.3,r-.8,r*.47-.7,0,Math.PI,Math.PI*2);c.strokeStyle='#92acb5';c.lineWidth=.4;c.stroke();
 round(c,x-3,y-5.6,3.8,2.4,.2,'#d9d1b7','#536970');round(c,x+3,y-5,1.3,1.8,.4,'#d5e2de','#354f5e');c.restore();
}
function drawSuit(c,x,y,color,phase,face,ghost,body,hat='none'){
 c.save();c.translate(x,y);c.scale(face,1);c.fillStyle='#07151c66';c.beginPath();c.ellipse(0,.9,3.8,1.1,0,0,7);c.fill();
 c.globalAlpha=ghost?.53:1;c.lineWidth=.65;
 if(body){
  round(c,-3.7,-3.1,6.6,3.3,1.4,color,'#18212c');round(c,-3,-.8,2.2,1.4,.6,color,'#18212c');round(c,.1,-.8,2,1.3,.6,color,'#18212c');
  round(c,-.7,-4.9,1.2,2.1,.4,'#e9e5dd','#29373d');round(c,-1.5,-5.3,2.7,1,.5,'#f2ede1','#29373d');c.restore();return;
 }
 const bob=Math.sin(phase)*.22;c.translate(0,bob);
 round(c,-3.9,-6.2,2.1,4,.8,color,'#17242d');
 const gait=Math.sin(phase)*1.1;
 if(!ghost){
  for(const side of [-1,1]){
   c.save();c.translate(side<0?-1.5:1.4,-2.5);c.rotate(side*gait*.55);
   round(c,-1,0,2.2,3.3-Math.max(0,side*gait)*.45,.85,color,'#18212b');c.restore();
  }
 }
 c.beginPath();c.moveTo(-2.8,-2);c.bezierCurveTo(-3.3,-4.2,-3.3,-7.9,-1,-8.4);
 c.bezierCurveTo(2,-9.1,3.5,-7.5,3.4,-5.1);c.lineTo(3.1,-2);c.quadraticCurveTo(.2,-.6,-2.8,-2);c.fillStyle=color;c.fill();c.strokeStyle='#17212a';c.stroke();
 c.beginPath();c.moveTo(-2.7,-4.8);c.quadraticCurveTo(-1.7,-2.4,2.9,-3.2);c.lineTo(2.8,-2.1);c.quadraticCurveTo(.3,-.8,-2.6,-2);c.fillStyle='#08203a45';c.fill();
 const visor=c.createLinearGradient(0,-7,0,-4);visor.addColorStop(0,'#e3ffff');visor.addColorStop(.36,'#b6e3ee');visor.addColorStop(1,'#507886');
 round(c,-.8,-6.8,4.4,2.6,1.25,visor,'#192a35');round(c,.1,-6.4,1.9,.45,.2,'#fff');
 if(ghost){
  c.beginPath();c.moveTo(3,-2.2);c.bezierCurveTo(2.5,1.5,-1.8,2.2,-5.4,.4);
  c.bezierCurveTo(-3.4,.1,-3.1,-.4,-2.7,-2.3);c.fillStyle=color;c.fill();c.strokeStyle='#243340';c.stroke();
 }

 if(hat==='antenna'){c.strokeStyle='#202d36';c.lineWidth=.55;c.beginPath();c.moveTo(-1.4,-8);c.lineTo(-2.5,-9.8);c.stroke();round(c,-3.1,-10.3,1.2,1.2,.5,'#a9e6ce','#263841');}
 if(hat==='cap'){round(c,-2.8,-8.7,4.3,1.3,.55,'#45596a','#243240');round(c,-2,-8,5.3,.65,.3,'#687e8d');}
 if(hat==='sprout'){c.strokeStyle='#244636';c.lineWidth=.5;c.beginPath();c.moveTo(0,-8);c.lineTo(.2,-10.4);c.stroke();poly(c,[[.2,-9.8],[-1.8,-11],[-2.8,-10.6],[-1.7,-9.5]],'#80b99b');poly(c,[[.1,-10],[1.5,-11.6],[2.6,-11.4],[1.7,-10]],'#a6d6ae');}
 if(hat==='horn'){poly(c,[[-2,-8],[-2.8,-10.4],[-.6,-8.3]],'#e0c496');poly(c,[[.7,-8.4],[2.6,-10.6],[2,-8]],'#e8d1a8');}
 c.restore();
}
function colorFor(id,ids){return suits[Math.max(0,ids.indexOf(id))%suits.length];}
export function createScene(mapName,initial,label,send,nearby){
 const map=maps[mapName],canvas=document.createElement('canvas');let world=makeWorld(map,mapName);
 const atlas=new Image(),stations=new Image();
 const paintArt=()=>{if(active&&atlas.naturalWidth&&stations.naturalWidth){world=makeWorld(map,mapName,atlas,stations);canvas.dataset.art='loaded';}};
 atlas.onload=paintArt;stations.onload=paintArt;
 atlas.src='assets/imposter/rooms.png';stations.src='assets/imposter/stations.png';
 canvas.className='imp-world';canvas.tabIndex=0;canvas.setAttribute('aria-label','Walk through '+mapName+' using WASD, arrows or drag');
 let state=initial,px=initial.me.x??map.rooms[initial.me.room]?.[1]??map.rooms[0][1],py=initial.me.y??map.rooms[initial.me.room]?.[2]??map.rooms[0][2];
 let revision=initial.me.move_rev||0,queue=[],smoothX=0,smoothY=0;
 const step=(x,y,dx,dy)=>{if(clearStep(map,x+dx,y))x+=dx;if(clearStep(map,x,y+dy))y+=dy;return [x,y];};
 let cameraX=px,cameraY=py,face=1,stride=0,last=0,lastSend=0,inflight=false,pending=null,active=true,raf=0,pointer=null;
 const keys=new Set(),peers=new Map();let target=null;
 const key=e=>{if(!canvas.isConnected||!canvas.closest('dialog')?.open||e.target.matches?.('input,select,textarea'))return;
  if(['w','a','s','d','arrowleft','arrowright','arrowup','arrowdown'].includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());}};
 const up=e=>keys.delete(e.key.toLowerCase()),blur=()=>{keys.clear();pointer=null;};
 window.addEventListener('keydown',key);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
 canvas.onpointerdown=e=>{canvas.focus();canvas.setPointerCapture(e.pointerId);pointer=[e.clientX,e.clientY,e.clientX,e.clientY];target=null;};
 canvas.onpointermove=e=>{if(pointer){pointer[2]=e.clientX;pointer[3]=e.clientY;}};
 canvas.onpointerup=e=>{if(pointer&&Math.hypot(pointer[2]-pointer[0],pointer[3]-pointer[1])<5){const r=canvas.getBoundingClientRect(),z=Math.min(r.width/100,r.height/61);target=[cameraX+(e.clientX-r.left-r.width/2)/z,cameraY+(e.clientY-r.top-r.height/2)/z];}pointer=null;};
 canvas.onpointercancel=()=>pointer=null;
 async function sync(now){
  if(inflight||now-lastSend<85||!queue.length)return;
  inflight=true;lastSend=now;
  pending??={revision,steps:queue.slice(0,24)};const batch=pending.steps,count=batch.length;
  try{
   const ack=await send(pending.revision,batch);
   if(!active||!ack)return;
   // The server can defer a batch until movement credit replenishes.
   // Retain predicted steps until the authoritative revision advances.
   if(ack.revision===pending.revision)return;
   if(ack.revision!==pending.revision+1){
    queue=[];pending=null;revision=ack.revision;
    smoothX+=px-ack.x;smoothY+=py-ack.y;px=ack.x;py=ack.y;
    return;
   }
   queue.splice(0,count);revision=ack.revision;pending=null;
   let x=ack.x,y=ack.y;
   for(const [dx,dy] of queue)[x,y]=step(x,y,dx,dy);
   smoothX+=px-x;smoothY+=py-y;px=x;py=y;
  }finally{inflight=false;}
 }
 const light=document.createElement('canvas');
 let positions=null,fetching=false,lastFetch=0;
 async function sample(now){
  if(!nearby||fetching||now-lastFetch<120)return;
  fetching=true;lastFetch=now;
  try{const rows=await nearby();if(active&&Array.isArray(rows))positions=rows;}
  finally{fetching=false;}
 }
 function draw(now){
  if(!active)return;void sample(now);const dt=Math.min(.05,(now-last)/1000||0);last=now;
  let dx=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  let dy=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
  if(pointer&&Math.hypot(pointer[2]-pointer[0],pointer[3]-pointer[1])>5){dx=pointer[2]-pointer[0];dy=pointer[3]-pointer[1];}
  if(dx||dy)target=null;else if(target){dx=target[0]-px;dy=target[1]-py;if(Math.hypot(dx,dy)<1){target=null;dx=dy=0;}}
  const len=Math.hypot(dx,dy),oldX=px,oldY=py;
  if(len&&queue.length<180){dx=dx/len*dt*speed;dy=dy/len*dt*speed;[px,py]=step(px,py,dx,dy);if(px!==oldX||py!==oldY)queue.push([px-oldX,py-oldY]);if(dx)face=dx<0?-1:1;}
  const moved=Math.hypot(px-oldX,py-oldY);stride=moved?stride+moved*.65:0;
  if(queue.length)void sync(now);smoothX*=Math.exp(-dt*18);smoothY*=Math.exp(-dt*18);
  cameraX+=(px-cameraX)*Math.min(1,dt*13);cameraY+=(py-cameraY)*Math.min(1,dt*13);
  const w=canvas.clientWidth||760,h=canvas.clientHeight||420,dpr=Math.min(2,window.devicePixelRatio||1);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#17212a';c.fillRect(0,0,w,h);
  const z=Math.min(w/100,h/61);c.translate(w/2,h/2);c.scale(z,z);c.translate(-cameraX,-cameraY);
  c.drawImage(world,0,0,710,410);
  const ids=state.players.map(p=>p.uid).sort(),actors=[];
  for(const p of positions||state.players){if((p.uid===state.me.uid&&!p.body)||p.x==null||p.y==null)continue;
   let v=peers.get(p.uid);if(!v){v={x:p.x,y:p.y,face:1,phase:0};peers.set(p.uid,v);}
   if(v.rev!==p.rev){const age=p.at-v.at;
    v.vx=age>0&&age<500?(p.x-v.tx)/age:0;v.vy=age>0&&age<500?(p.y-v.ty)/age:0;
    v.rev=p.rev;v.tx=p.x;v.ty=p.y;v.at=p.at;v.received=now;
   }
   const ahead=Math.max(0,Math.min(90,now-(v.received||now)));let tx=p.x+(v.vx||0)*ahead,ty=p.y+(v.vy||0)*ahead;
   if(now-v.received>160||p.body||!clearStep(map,tx,ty)){tx=p.x;ty=p.y;}
   const delta=tx-v.x,travel=Math.hypot(delta,ty-v.y);if(Math.abs(delta)>.1)v.face=delta<0?-1:1;
   v.x+=delta*Math.min(1,dt*24);v.y+=(ty-v.y)*Math.min(1,dt*24);v.phase=travel>.1?v.phase+dt*15:0;
   actors.push({...v,id:p.uid,body:p.body,ghost:!p.alive});
  }
  actors.push({id:state.me.uid,x:px+smoothX,y:py+smoothY,face,phase:stride,ghost:!state.me.alive});
  for(let i=1;i<map.rooms.length;i++){const r=map.rooms[i];actors.push({console:true,x:r[1],y:r[2]-r[4]*.24,marked:state.me.role==='Innocent'&&!state.game.lights_out&&state.me.todo.includes(i)&&!state.me.done.includes(i)});}
  const cafe=map.rooms[0];for(const side of [-1,1])actors.push({prop:true,x:cafe[1]+side*cafe[3]*.26,y:cafe[2]+cafe[4]*.18,r:cafe[3]*.093});
  for(const p of actors.sort((a,b)=>a.y-b.y)){
   if(p.console){raisedConsole(c,p.x,p.y,p.marked);continue;}
   if(p.prop){raisedTable(c,p.x,p.y,p.r);continue;}
   const look=state.players.find(m=>m.uid===p.id)||state.me;drawSuit(c,p.x,p.y,suits[look.suit]||colorFor(p.id,ids),p.phase,p.face,p.ghost,p.body,look.hat);
   if(!p.body){c.textAlign='center';c.font='bold 2.7px sans-serif';c.lineWidth=.7;c.strokeStyle='#14242c';c.strokeText(label(p.id),p.x,p.y-9.8);c.fillStyle='white';c.fillText(label(p.id),p.x,p.y-9.8);}
  }
  // Subpixel wall intersections and a feathered alpha mask keep light edges smooth.
  const sight=state.game.lights_out&&state.me.role==='Innocent'?17:49,points=[];
  for(let i=0;i<240;i++){const a=i*Math.PI/120,vx=Math.cos(a),vy=Math.sin(a);let hi=sight,lo=0;
   for(let r=1;r<=sight;r+=1){if(floorAt(map,px+vx*r,py+vy*r,false)===-2){hi=r;lo=Math.max(0,r-1);break;}lo=r;}
   for(let k=0;k<4;k++){const mid=(lo+hi)/2;if(floorAt(map,px+vx*mid,py+vy*mid,false)===-2)hi=mid;else lo=mid;}
   points.push([(px+vx*lo-cameraX)*z+w/2,(py+vy*lo-cameraY)*z+h/2]);
  }
  if(light.width!==Math.round(w)||light.height!==Math.round(h)){light.width=Math.round(w);light.height=Math.round(h);}
  const lc=light.getContext('2d');lc.clearRect(0,0,w,h);lc.globalCompositeOperation='source-over';lc.fillStyle='#061019d9';lc.fillRect(0,0,w,h);
  lc.globalCompositeOperation='destination-out';lc.filter='blur(3px)';lc.beginPath();points.forEach(([x,y],i)=>i?lc.lineTo(x,y):lc.moveTo(x,y));lc.closePath();lc.fillStyle='#fff';lc.fill();lc.filter='none';lc.globalCompositeOperation='source-over';
  c.save();c.setTransform(dpr,0,0,dpr,0,0);c.drawImage(light,0,0,w,h);c.restore();
  const shade=c.createRadialGradient(px,py,6,px,py,sight);shade.addColorStop(0,'#0e192100');shade.addColorStop(.6,'#0e192112');shade.addColorStop(1,'#0e19217a');c.fillStyle=shade;c.fillRect(cameraX-w/z,cameraY-h/z,w/z*2,h/z*2);
  const marker=canvas.parentElement?.querySelector('[data-self-marker]');if(marker)marker.setAttribute('transform','translate('+px+' '+py+')');
  raf=requestAnimationFrame(draw);
 }
 raf=requestAnimationFrame(draw);
 return {canvas,position:()=>({x:px,y:py}),update(data){state=data;},destroy(){active=false;cancelAnimationFrame(raf);window.removeEventListener('keydown',key);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);}};
}
const previewArt=new Map();
function loadSheet(file){
 if(!previewArt.has(file))previewArt.set(file,new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src='assets/imposter/'+file+'.png';
 }));
 return previewArt.get(file);
}
export function previewScene(name){
 const cv=document.createElement('canvas');cv.width=640;cv.height=336;cv.className='imp-preview-scene';cv.dataset.map=name;
 cv.setAttribute('aria-label',name+' gameplay preview');
 const file=name==='Frostline'?'rooms':'stations',tile={Keel:0,Caldera:4,Frostline:8}[name];
 loadSheet(file).then(img=>{
  const c=cv.getContext('2d'),w=img.naturalWidth/3,h=img.naturalHeight/3;
  c.drawImage(img,(tile%3)*w+2,Math.floor(tile/3)*h+2,w-4,h-4,0,0,640,336);
  const vignette=c.createRadialGradient(322,238,45,322,220,340);
  vignette.addColorStop(0,'#09182400');vignette.addColorStop(1,'#091824a8');c.fillStyle=vignette;c.fillRect(0,0,640,336);
  for(const [x,y,k,face] of [[273,226,5,1],[354,249,2,-1]]){
   c.save();c.translate(x,y);c.scale(7,7);drawSuit(c,0,0,suits[k],0,face,false,false);c.restore();
  }
  cv.dataset.art='loaded';
 }).catch(()=>{cv.setAttribute('aria-label',name+' preview unavailable');});
 return cv;
}
export function suitBadge(p,players){
 const cv=document.createElement('canvas');cv.className='imp-suit-badge';cv.width=186;cv.height=210;cv.setAttribute('aria-hidden','true');
 const c=cv.getContext('2d');c.scale(3,3);c.translate(31,59);c.scale(5.2,5.2);
 drawSuit(c,0,0,suits[p.suit]||colorFor(p.uid,players.map(v=>v.uid).sort()),0,1,p.alive===false,false,p.hat);
 return cv;
}
export function reveal(role,players,count,viewer){
 const overlay=document.createElement('div');overlay.className='imp-reveal '+(role==='Imposter'?'imp-danger':'');
 const heading=document.createElement('strong');heading.textContent=role;const hint=document.createElement('span');hint.textContent=role==='Imposter'?'Eliminate the innocents.':count===1?'One imposter is among the crew.':count+' imposters are among the crew.';
 const canvas=document.createElement('canvas');canvas.width=480;canvas.height=115;const c=canvas.getContext('2d');const ids=players.map(p=>p.uid).sort(),others=ids.filter(id=>id!==viewer).slice(0,8);
 others.forEach((id,i)=>{const side=i%2?-1:1,dist=Math.floor(i/2)+1;c.save();c.translate(240+side*dist*42,93-dist*7);c.scale(7-dist*.55,7-dist*.55);const look=players.find(p=>p.uid===id);drawSuit(c,0,0,suits[look.suit]||colorFor(id,ids),0,-side,false,false,look.hat);c.restore();});
 c.save();c.translate(240,104);c.scale(10,10);const look=players.find(p=>p.uid===viewer)||{};drawSuit(c,0,0,suits[look.suit]||colorFor(viewer,ids),0,1,false,false,look.hat);c.restore();
 overlay.append(heading,canvas,hint);overlay.onclick=()=>overlay.remove();setTimeout(()=>overlay.remove(),2400);return overlay;
}
export function outcome(data,label){
 const won=data.me.role===data.game.winner;
 const panel=document.createElement('section');panel.className='imp-outcome '+(won?'won':'lost');
 const title=document.createElement('h2');title.textContent=won?'Victory':'Defeat';
 const detail=document.createElement('p');detail.textContent=data.game.winner+' team wins';
 const line=document.createElement('div');line.className='imp-lineup';
 const winners=data.players.filter(p=>p.role===data.game.winner);
 const focus=winners.find(p=>p.uid===data.me.uid)||winners[0];
 const ordered=winners.filter(p=>p!==focus);ordered.splice(Math.floor(ordered.length/2),0,focus);
 for(const p of ordered.filter(Boolean)){const figure=document.createElement('figure');figure.classList.toggle('featured',p===focus);
  figure.append(suitBadge({...p,alive:true},data.players));const caption=document.createElement('figcaption');caption.textContent=label(p.uid);figure.append(caption);line.append(figure);}
 panel.append(title,line,detail);return panel;
}
