import {maps,corridorPoints} from './imposter-layout.js';
import {createScene,reveal,previewScene,suitBadge,suits,outcome} from './imposter-scene.js';
// The numbered nodes match the server's movement graph. Coordinates and room
// outlines are original to Cove. Cafe is the meeting point on every map.
const svgNS='http://www.w3.org/2000/svg';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
function shape(tag,attrs){const n=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;}
function button(text,click){const n=el('button',text);n.type='button';n.onclick=click;return n;}
function option(label,values,value){
  const wrap=el('label',label),select=el('select');
  for(const v of values){const o=el('option',String(v));o.value=v;select.append(o);}
  select.value=value;wrap.append(select);return [wrap,select];
}
function pilot(g,x,y,color){
  const p=shape('g',{transform:'translate('+x+' '+y+')'});
  p.append(shape('ellipse',{cx:0,cy:6,rx:8,ry:2.5,fill:'#0a1723',opacity:.6}),
    shape('path',{d:'M-6 4V-2Q-6-9 0-9Q6-9 6-2V4L3 5L2 3H-1L-2 5Z',fill:color,stroke:'#122634','stroke-width':1.4}),
    shape('rect',{x:-2,y:-6,width:7,height:4,rx:2,fill:'#d2ffff'}));g.append(p);return p;
}
function scenery(svg,map,steel,accent){
 const id='imp-floor-'+map;
 const defs=shape('defs',{}),grad=shape('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'100%'});
 grad.append(shape('stop',{offset:'0%','stop-color':steel,'stop-opacity':.65}),shape('stop',{offset:'100%','stop-color':'#21313e'}));
 defs.append(grad);svg.append(defs);
 if(map==='Keel'){
  for(const x of [84,115,146])svg.append(shape('path',{d:'M'+x+' 354l14 6 5 14-23-4Z',fill:steel,opacity:.3}));
 }else if(map==='Caldera'){
  for(const [x,y,k] of [[47,100,.7],[624,42,.85],[340,374,.5]]){const ridge=shape('g',{transform:'translate('+x+' '+y+') scale('+k+')'});
   ridge.append(shape('path',{d:'M-42 8 -24-19 12-25 40-5 39 15 5 26 -28 23Z',fill:'#634959',stroke:'#ab756d'}),
    shape('path',{d:'M-25 4 -11-10 11-12 24-2 14 11 -8 14Z',fill:'#ba7058'}));svg.append(ridge);}
 }else{
  for(const [x,y,k] of [[29,68,.8],[637,65,1],[67,344,1.2],[270,366,.65]]){const ridge=shape('g',{transform:'translate('+x+' '+y+') scale('+k+')'});
   ridge.append(shape('path',{d:'M-20 18 -3-16 14 13 20-3 36 21Z',fill:'#526b80',stroke:'#7694ab'}),shape('path',{d:'M-9-4 -3-16 4-3 0-5 -3-1Z',fill:'#c3d8e3'}));svg.append(ridge);}
 }
 const ticks=shape('g',{stroke:accent,opacity:.47});
 for(let i=0;i<5;i++)ticks.append(shape('path',{d:'M'+(18+i*6)+' 392v-'+(i%2?3:6)}));svg.append(ticks);
}
function board(data){
  const {game,me}=data,map=maps[game.map],svg=shape('svg',{viewBox:'0 0 710 408','aria-label':game.map+' floorplan',role:'group'});
  svg.classList.add('imp-map');
  const [bg,steel,accent]=map.palette;
  svg.append(shape('rect',{width:710,height:408,fill:bg,rx:15}));
  // Chart grid, route beds, centerlines and beveled chambers keep the drawing
  // legible at small sizes without textures or a continuous graphics loop.
  for(let x=14;x<710;x+=24)for(let y=12;y<408;y+=24)svg.append(shape('circle',{cx:x,cy:y,r:1,fill:steel,opacity:.26}));
  const terrain=game.map==='Caldera'?['M0 327 75 196 172 182 229 88 334 116 421 38 542 75 621 142 710 122V408H0Z','#494155']:
    game.map==='Frostline'?['M0 167 147 96 256 134 360 48 451 102 610 69 710 91V408H0Z','#30465a']:
    ['M29 172 96 62 250 67 316 25 421 44 488 77 602 82 685 149 666 250 534 362 412 377 266 346 110 330Z','#223946'];
  svg.append(shape('path',{d:terrain[0],fill:terrain[1],stroke:steel,'stroke-width':1,opacity:.8}));
  scenery(svg,game.map,steel,accent);
  const paths=map.routes.map(pair=>corridorPoints(map,pair).map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' '));
  for(const [width,color] of [[22,steel],[17,'#233540'],[1,accent]])for(const path of paths)svg.append(shape('path',{d:path,fill:'none',stroke:color,'stroke-width':width,'stroke-dasharray':width===1?'4 5':'none'}));
  map.rooms.forEach(([name,x,y,w,h],i)=>{
    const here=i===me.room,linked=map.routes.some(r=>r.includes(String(i))&&r.includes(String(me.room))&&!here);
    const g=shape('g',{transform:'translate('+x+' '+y+')','aria-label':name+(here?', current room':'')});
    const l=-w/2,t=-h/2,d=i===0?18:i%3===0?4:10;
    const points=[[l+d,t],[w/2-d,t],[w/2,t+d],[w/2,h/2-d],[w/2-d,h/2],[l+d,h/2],[l,h/2-d],[l,t+d]].map(p=>p.join(',')).join(' ');
    g.append(shape('polygon',{points,fill:here?'#23505b':linked?'url(#imp-floor-'+game.map+')':'#2c3944',stroke:here?accent:steel,'stroke-width':here?3:2}));
    for(let j=0;j<3;j++)g.append(shape('rect',{x:l+12+j*6,y:t+8,width:4,height:3,fill:j===0?accent:steel}));
    const label=shape('text',{'text-anchor':'middle',y:2,fill:'#f3f7fa','font-size':13,'font-weight':600});label.textContent=name;g.append(label);
    if(i===0){for(const x of [-30,30])g.append(shape('ellipse',{cx:x,cy:15,rx:8,ry:4,fill:steel,opacity:.55}));}
    else if(i%3===1){for(let j=0;j<3;j++)g.append(shape('rect',{x:l+15+j*12,y:h/2-13,width:9,height:5,rx:1,fill:steel,opacity:.55}));}
    else{g.append(shape('path',{d:'M'+(w/2-12)+' '+(h/2-12)+'h-17v-4h9',stroke:steel,fill:'none','stroke-width':2}));}
    if(me.todo?.includes(i)&&!me.done.includes(i))g.append(shape('circle',{cx:w/2-10,cy:t+10,r:4,fill:'#ffd477'}));
    svg.append(g);
  });
  const marker=shape('g',{'data-self-marker':'true','aria-label':'Your position'});marker.append(shape('circle',{r:9,fill:'#112631',stroke:'#fff','stroke-width':2}),shape('circle',{r:5,fill:suits[me.suit]||'#61dbed'}));
  const tag=shape('text',{y:-13,'text-anchor':'middle',fill:'white','font-size':12,'font-weight':700,stroke:'#14222a','stroke-width':3,'paint-order':'stroke'});tag.textContent='You';marker.append(tag);marker.setAttribute('transform','translate('+me.x+' '+me.y+')');svg.append(marker);return svg;
}
export function mountImposter({rpc,user,label,friends}){
 const dialog=el('dialog',null,'imp-dialog'),frame=el('div',null,'imp-frame'),head=el('header'),title=el('h2','Open Games'),body=el('div',null,'imp-body'),status=el('p',null,'hint');
 head.append(title,button('×',()=>dialog.close()));head.lastChild.setAttribute('aria-label','Close Open Games');frame.append(head,body,status);dialog.append(frame);document.body.append(dialog);
 let gameId=null,snapshot=null,token=0,busy=false,reading=false,task=null,chatDraft='',config=false,last='',listTimer,uiTimer;
 let actionButtons={};
 let scene=null,revealed=false,mapOpen=false,tasksExpanded=true;
 function stopScene(){scene?.destroy();scene=null;actionButtons={};}
 function ensureScene(data){
  if(!scene)scene=createScene(data.game.map,data,label,async(revision,steps)=>{
   if(busy||!dialog.open)return null;
   try{return await rpc('imp_steps_v2',{game_id:gameId,revision,steps});}catch(e){error(e);return null;}
  },async()=>{
   if(busy||!dialog.open)return null;
   try{return await rpc('imp_nearby',{game_id:gameId});}catch{return null;}
  });
  scene.update(data);
  return scene;
 }
 function reset(){stopScene();revealed=false;mapOpen=false;token++;gameId=null;snapshot=null;busy=false;reading=false;task=null;config=false;last='';chatDraft='';status.textContent='';}
 dialog.addEventListener('close',()=>{clearInterval(listTimer);clearInterval(uiTimer);reset();});
 const close=()=>{if(dialog.open)dialog.close();};
 function error(e){status.textContent=e.message||String(e);}
 async function read(){
  if(!dialog.open||busy||reading||config)return;
  const t=token;reading=true;
  try{
   if(gameId){const data=await rpc('imp_action_v2',{game_id:gameId,act:'read',arg:''});if(t===token&&!busy)apply(data);}
   else{const games=await rpc('imp_list_v2');if(t===token&&!busy&&!config){const key=JSON.stringify(games);if(key!==last){last=key;renderList(games);}}}
  }catch(e){if(t===token){if(gameId&&/Match unavailable|Join the lobby first|Join this lobby first/i.test(e.message||'')){const wasClosed=/Match unavailable/i.test(e.message||'');home();status.textContent=wasClosed?'This lobby was closed.':'You were removed from the lobby.';}else error(e);}}finally{if(t===token)reading=false;}
 }
 async function perform(act,arg=''){
  if(busy)return;busy=true;const t=++token;reading=false;status.textContent='';
  try{const data=await rpc('imp_action_v2',{game_id:gameId,act,arg:String(arg)});if(t!==token)return;if(act==='leave'||act==='close'){home();return;}apply(data);}
  catch(e){if(t===token)error(e);}finally{if(t===token)busy=false;}
 }
 function apply(data){
  const previousPhase=snapshot?.game.phase;
  if(previousPhase&&previousPhase!==data.game.phase&&(previousPhase==='lobby'||data.game.phase==='lobby'))stopScene();
  snapshot=data;scene?.update(data);const station=maps[data.game.map].rooms[data.me.room];
  const proximity=[station&&Math.hypot(data.me.x-station[1],data.me.y-(station[2]-station[4]*.24))<=12,...data.players.map(p=>[p.uid,Math.hypot(p.x-data.me.x,p.y-data.me.y)<=13,Math.hypot(p.x-data.me.x,p.y-data.me.y)<=15])];
  const key=JSON.stringify(data,(k,v)=>['x','y','walked_at','move_rev','move_credit'].includes(k)?undefined:v)+JSON.stringify(proximity);if(key===last)return;last=key;
  if(!['play','lobby'].includes(data.game.phase)){task=null;stopScene();}
  if(data.game.phase==='lobby')revealed=false;
  const focused=document.activeElement?.classList.contains('imp-say');renderMatch(data);updateActionButtons();
  if(focused){const input=body.querySelector('.imp-say');input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}
 }
 function home(){reset();title.textContent='Open Games';body.replaceChildren();read();}
 function enter(id,join){reset();gameId=id;title.textContent='Imposter';body.replaceChildren();if(join)perform('join');else read();}
 function renderList(games){
  title.textContent='Open Games';const cover=el('div',null,'imp-cover');
  const chart=previewScene('Keel');chart.setAttribute('aria-hidden','true');chart.classList.add('imp-cover-chart');cover.append(chart);
  cover.append(el('h3','Imposter'),el('p','Find the imposters or finish your tasks.'),button('Create lobby',settings));body.replaceChildren(cover);
  for(const g of games){const row=el('div',null,'imp-row');
   row.append(el('strong',g.name||g.map),el('span',label(g.host)+' · '+g.players+' joined · '+g.phase));
   if(g.joined||g.phase==='lobby')row.append(button(g.joined?'Open':'Join game',()=>enter(g.id,!g.joined)));
   else row.append(el('small','In progress'));
   if(g.is_admin)row.append(button('Delete game',async()=>{
    if(!window.confirm('Delete '+(g.name||g.map)+' for everyone?'))return;
    try{await rpc('imp_delete_game',{game_id:g.id});last='';await read();}catch(e){error(e);}
   }));
   body.append(row);
  }
 }
 function settings(editing=false){
  editing=editing===true;const current=editing?snapshot.game:{};
  config=true;const nameInput=el('input');nameInput.maxLength=40;nameInput.value=current.name||'My Imposter Lobby';nameInput.placeholder='Lobby name';const nameField=el('label','Lobby name');nameField.append(nameInput);const fields=[
    option('Map',current.map&&current.map!=='Keel'?['Keel',current.map]:['Keel'],current.map||'Keel'),option('Imposters',[1,2,3],current.imposters||1),option('Kill cooldown (seconds)',[5,10,20,30,45,60],current.cooldown||20),
    option('Tasks per innocent',[1,2,3,4,5],current.tasks||3),option('Meeting time (seconds)',[20,30,45,60,90,120],current.vote_seconds||45),option('Meeting cooldown (seconds)',[10,20,30,45,60,90,120],current.meeting_cooldown||30)
  ];
  const form=el('div',null,'imp-settings');form.append(nameField,...fields.map(f=>f[0]));
  const preview=el('div',null,'imp-chart-preview');
  const drawPreview=()=>{
   const name=fields[0][1].value;
   const caption=el('div',null,'imp-map-caption');caption.append(el('strong',name),el('small',({Keel:'Orbital vessel',Caldera:'Volcanic field station',Frostline:'Polar outpost'})[name]));
   preview.replaceChildren(caption,previewScene(name));
  };
  fields[0][1].onchange=drawPreview;drawPreview();
  form.append(button(editing?'Save settings':'Create lobby',async()=>{if(busy)return;busy=true;const t=token;try{const v=fields.map(f=>f[1].value);
   if(editing){busy=false;config=false;last='';await perform('configure',JSON.stringify({map:v[0],imposters:+v[1],cooldown:+v[2],tasks:+v[3],vote_seconds:+v[4],meeting_cooldown:+v[5],name:nameInput.value.trim()}));return;}
   const id=await rpc('imp_create_v2',{map_name:v[0],imposters:+v[1],cooldown:+v[2],task_count:+v[3],vote_seconds:+v[4],lobby_name:nameInput.value.trim(),meeting_cooldown_seconds:+v[5]});if(t===token)enter(id,false);
  }catch(e){if(t===token)error(e);}finally{if(t===token)busy=false;}}),button('Back',editing?()=>{config=false;renderMatch(snapshot);}:home));title.textContent=editing?'Lobby settings':'Create Imposter lobby';const shell=el('div',null,'imp-setup-shell');shell.append(preview,form);body.replaceChildren(shell);
 }
 function taskPanel(me){
  const panel=el('section',null,'imp-task');
  if(!task){panel.append(button('Work on task',()=>{task={step:0,order:[0,1,2].map(n=>(me.room+n+Math.floor(Date.now()/1000))%3)};renderMatch(snapshot);}));return panel;}
  const modes=[['Calibrate relay',['◆','▲','●']],['Route power',['A','B','C']],['Tune signal',['Low','Mid','High']]];const [station,marks]=modes[me.room%3];panel.append(el('strong',station),el('span',task.order.map((v,i)=>i<task.step?'✓':marks[v]).join('  ')));
  for(let i=0;i<3;i++)panel.append(button(marks[i],()=>{if(i!==task.order[task.step])task.step=0;else task.step++;
   if(task.step===3){task=null;perform('task');}else renderMatch(snapshot);}));
  return panel;
 }
 function renderMatch(data){
  const {game,me,players}=data;title.textContent=(game.name||game.map)+' · Imposter';
  const top=el('div',null,'imp-row');
  top.append(button('← Open Games',home),el('span',players.filter(p=>p.joined).length+' players'));
  if(me.uid===game.host)top.append(button('Close lobby',()=>{if(window.confirm('Close this lobby and end the game for everyone?'))perform('close');}));
  else top.append(button('Leave lobby',()=>perform('leave')));
  body.replaceChildren(top);
  if(game.phase==='lobby'){
   // The ship remains the actual lobby, with movement and other players live.
   const ship=ensureScene(data),stage=el('div',null,'imp-stage imp-lobby-stage');
   stage.append(ship.canvas);
   const roomName=maps[game.map].rooms[me.room]?.[0]||'Passage';
   const bar=el('div',null,'imp-scene-bar');
   const mapButton=button(mapOpen?'Close map':'Map',()=>{mapOpen=!mapOpen;renderMatch(snapshot);});
   bar.append(el('b',roomName),mapButton);stage.append(bar);
   if(mapOpen){const overview=board(data);overview.classList.add('imp-overview');stage.append(overview);}
   const overlay=el('aside',null,'imp-lobby-controls');
   overlay.append(el('strong','Waiting in '+(game.name||game.map)),
    el('small',players.filter(p=>p.joined).length+' joined · '+game.imposters+' imposter(s) · '+game.tasks+' tasks each'));
   const dressing=el('section',null,'imp-dressing imp-lobby-dressing');
   dressing.append(el('strong','Customize your character'));
   const colors=el('div',null,'imp-swatches');
   const colorNames=['Coral','Green','Blue','Gold','Violet','Pink','Teal','Pearl','Copper','Olive','Slate','Peach'];
   suits.forEach((hex,i)=>{
    const swatch=button('',()=>perform('cosmetic',JSON.stringify({suit:i,hat:me.hat||'none'})));
    swatch.style.backgroundColor=hex;swatch.setAttribute('aria-label',colorNames[i]);
    swatch.title=colorNames[i];swatch.setAttribute('aria-pressed',String(i===me.suit));
    swatch.disabled=players.some(p=>p.uid!==me.uid&&p.joined&&p.suit===i);colors.append(swatch);
   });
   const hat=option('Hat',['none','antenna','cap','sprout','horn'],me.hat||'none');
   hat[1].onchange=()=>perform('cosmetic',JSON.stringify({suit:me.suit??0,hat:hat[1].value}));
   dressing.append(colors,hat[0]);overlay.append(dressing);
   const roster=el('details',null,'imp-lobby-roster');
   roster.append(el('summary','Crew · '+players.filter(p=>p.joined).length));
   for(const p of players){const tile=el('div',null,'imp-member');
    tile.append(suitBadge(p,players),el('span',label(p.uid)+(p.uid===game.host?' · Host':'')+(p.joined?' · Joined':' · Invited')));
    if(me.uid===game.host&&p.uid!==me.uid&&p.joined)tile.append(button('Kick',()=>kickPlayer(p)));
    roster.append(tile);
   }
   overlay.append(roster);
   if(me.uid===game.host){
    const hostActions=el('div',null,'imp-lobby-host-actions');
    hostActions.append(button('Lobby settings',()=>{stopScene();settings(true);}));
    const start=button('Start match',()=>perform('start'));
    start.disabled=players.filter(p=>p.joined).length<game.imposters*2+1;
    hostActions.append(start);
    overlay.append(hostActions,el('small','At least '+(game.imposters*2+1)+' joined players required to start.'));
   }else overlay.append(el('small','Waiting for the host to start the match.'));
   stage.append(overlay);body.append(stage,el('small','Walk around the ship with WASD or arrow keys. Change your suit and hat while waiting.'));
   return;
  }
  if(game.phase==='finished'){body.append(outcome(data,label),el('p','Returning everyone to the lobby shortly…'));renderLastVotes(data);renderHostKickList(data);return;}
  const hud=el('div',null,'imp-info');hud.append(el('strong',(me.alive?'':'Ghost · ')+me.role),el('span','Tasks '+data.progress+'/'+data.total));
  const meter=el('progress');meter.max=Math.max(1,data.total);meter.value=data.progress;meter.setAttribute('aria-label','Crew task progress');hud.append(meter);body.append(hud);
  if(game.notice)body.append(el('small',game.notice));
  renderLastVotes(data);renderHostKickList(data);
  if(game.phase==='meeting'){
   body.append(el('h3','Meeting'),el('small','Voting closes '+new Date(game.deadline).toLocaleTimeString()));
   for(const msg of data.chat)body.append(el('p',label(msg.uid)+': '+msg.text,'imp-chat-line'));
   const votes=el('div',null,'imp-roster');votes.append(el('strong','Votes (visible to everyone)'));
   if(!data.votes?.length)votes.append(el('small','No votes yet'));
   for(const vote of data.votes||[])votes.append(el('p',label(vote.uid)+' voted '+(vote.choice==='skip'?'to skip':('for '+label(vote.choice)))));
   body.append(votes);
   if(me.alive){const input=el('input',null,'imp-say');input.placeholder='Discuss with the crew';input.maxLength=280;input.value=chatDraft;input.oninput=()=>chatDraft=input.value;
    const send=()=>{const text=chatDraft.trim();if(text){chatDraft='';perform('say',text);}};input.onkeydown=e=>{if(e.key==='Enter')send();};body.append(input,button('Send',send));
    if(!me.voted){const choices=el('div',null,'imp-actions');for(const p of players.filter(p=>p.alive)){const vote=button('Vote '+label(p.uid),()=>perform('vote',p.uid));vote.prepend(suitBadge(p,players));choices.append(vote);}choices.append(button('Skip vote',()=>perform('vote','skip')));body.append(choices);}else body.append(el('p','Vote recorded'));}
   return;
  }
  ensureScene(data);
  const stage=el('div',null,'imp-stage');stage.append(scene.canvas,hud);hud.classList.add('imp-world-hud');
  const roomName=maps[game.map].rooms[me.room]?.[0]||'Passage';
  const bar=el('div',null,'imp-scene-bar');const mapButton=button(mapOpen?'Close map':'Map',()=>{mapOpen=!mapOpen;renderMatch(snapshot);});
  bar.append(el('b',roomName),mapButton);
  stage.append(bar);if(mapOpen){const overview=board(data);overview.classList.add('imp-overview');stage.append(overview);}
  body.append(stage,el('small','Walk with WASD or arrows. Click the floor or drag to steer.'));
  if(!revealed){revealed=true;dialog.append(reveal(me.role,players,game.imposters,me.uid));}
  const actions=el('div',null,'imp-actions imp-world-actions');stage.append(actions);
  if(game.lights_out){body.append(el('div','Power outage · Restore power in Electrical','imp-warning'));}
  actionButtons={};
  if(me.role==='Imposter'){
   actionButtons.kill=button('Kill',()=>perform('kill_nearest'));
   actionButtons.sabotage=button('Cut power',()=>perform('sabotage'));
   actions.append(actionButtons.kill,actionButtons.sabotage);
  }
  actionButtons.report=button('Report body',()=>perform('report'));
  actionButtons.meeting=button('Emergency meeting',()=>perform('meeting'));
  actions.append(actionButtons.report,actionButtons.meeting);
  if(game.lights_out&&maps[game.map].rooms[me.room]?.[0]==='Electrical'){
   actionButtons.repair=button('Restore power',()=>perform('repair'));actions.append(actionButtons.repair);
  }
  updateActionButtons();
  if(me.role==='Innocent'){
   const remaining=me.todo.filter(i=>!me.done.includes(i));
   const list=el('details',null,'imp-task-list');list.open=tasksExpanded;list.ontoggle=()=>{tasksExpanded=list.open;};list.append(el('summary','Tasks · '+remaining.length));
   for(const i of remaining)list.append(el('span',maps[game.map].rooms[i][0]));
   stage.append(list);
   if(remaining.includes(me.room)&&!game.lights_out){
    const station=maps[game.map].rooms[me.room],near=Math.hypot(me.x-station[1],me.y-(station[2]-station[4]*.24))<=12;
    if(near)actions.append(taskPanel(me));else actions.append(el('span','Approach the marked console','imp-station-hint'));
   }
  }
 }
 function kickPlayer(p){
  if(window.confirm('Kick '+label(p.uid)+' from this lobby? They will not be able to rejoin it.'))perform('kick',p.uid);
 }
 function renderHostKickList(data){
  if(data.me.uid!==data.game.host||data.game.phase==='lobby')return;
  const details=el('details',null,'imp-kick-list');details.append(el('summary','Manage players'));
  for(const p of data.players.filter(p=>p.joined&&p.uid!==data.me.uid)){
   const row=el('div',null,'imp-row');row.append(el('span',label(p.uid)),button('Kick',()=>kickPlayer(p)));details.append(row);
  }
  body.append(details);
 }
 function renderLastVotes(data){
  if(!Array.isArray(data.game.last_votes)||!data.game.last_votes.length)return;
  const details=el('details',null,'imp-vote-recap');details.append(el('summary','Previous meeting votes'));
  for(const vote of data.game.last_votes)details.append(el('p',label(vote.uid)+' voted '+(vote.choice==='skip'?'to skip':'for '+label(vote.choice))));
  body.append(details);
 }
 function cooldownLeft(time){
  const ms=Date.parse(time);return Number.isFinite(ms)?Math.max(0,Math.ceil((ms-Date.now())/1000)):0;
 }
 function updateActionButtons(){
  if(!snapshot||snapshot.game.phase!=='play')return;
  const {game,me,players}=snapshot,alive=!!me.alive;
  const closest=players.filter(p=>p.uid!==me.uid&&p.alive&&p.role!=='Imposter'&&
   Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x-me.x,p.y-me.y)<=13)
   .sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0];
  const killTime=cooldownLeft(me.next_kill);
  if(actionButtons.kill){
   actionButtons.kill.textContent=killTime?'Kill · '+killTime+'s':'Kill';
   actionButtons.kill.disabled=busy||!alive||killTime>0||!closest;
   actionButtons.sabotage.textContent=game.lights_out?'Power out':(cooldownLeft(game.sabotage_ready)?'Sabotage · '+cooldownLeft(game.sabotage_ready)+'s':'Cut power');
   actionButtons.sabotage.disabled=busy||!alive||game.lights_out||cooldownLeft(game.sabotage_ready)>0;
  }
  const reportable=players.some(p=>p.body&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x-me.x,p.y-me.y)<=15);
  if(actionButtons.report)actionButtons.report.disabled=busy||!alive||!reportable;
  const meetingTime=cooldownLeft(game.meeting_ready_at);
  if(actionButtons.meeting){
   actionButtons.meeting.textContent=me.meeting_used?'Meeting used':meetingTime?'Meeting · '+meetingTime+'s':'Emergency meeting';
   actionButtons.meeting.disabled=busy||!alive||me.meeting_used||me.room!==0||meetingTime>0;
  }
  if(actionButtons.repair)actionButtons.repair.disabled=busy||!alive;
 }
 return {open(id=null){
  if(!user())return;
  if(!dialog.open)dialog.showModal();
  if(id){if(gameId!==id)enter(id,false);}else if(!gameId)home();
  clearInterval(listTimer);listTimer=setInterval(read,600);
  clearInterval(uiTimer);uiTimer=setInterval(updateActionButtons,200);
 },close};
}
