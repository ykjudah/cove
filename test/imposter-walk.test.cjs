const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {create}=require('./live-backend.cjs');
test('continuous walking rejects wall crossings and teleports; nearby players see the shared position',async()=>{
 const {db,user,ids}=await create();
 try{
  await db.exec('reset role');
  for(const f of ['upgrade-imposter.sql','upgrade-imposter-walk.sql'])await db.exec(fs.readFileSync(require.resolve('../supabase/'+f),'utf8'));
  await user(0);const id=(await db.query("select imp_create('Keel',1,10,2,20) id")).rows[0].id;
  await db.exec('reset role');
  for(const uid of ids.slice(1,3))await db.query('insert into private.imp_seats(game,uid,joined) values($1,$2,true)',[id,uid]);
  const act=async(i,a)=>{await user(i);return (await db.query("select imp_action($1,$2,'') p",[id,a])).rows[0].p;};
  const started=await act(0,'start'),{x,y}=started.me;
  await assert.rejects(act(0,'move'));
  assert.ok(Number.isFinite(x)&&Number.isFinite(y));
  const walk=async(px,py)=>(await db.query('select imp_walk($1,$2::real,$3::real) p',[id,px,py])).rows[0].p;
  assert.deepEqual(await walk(x+150,y),{x,y});
  const pos=await walk(x+3,y+2);assert.ok(Math.abs(pos.x-x-3)<.01);
  const observed=(await act(1,'read')).players.find(p=>p.uid===ids[0]);assert.equal(observed.x,pos.x);
  await user(3);await assert.rejects(walk(x,y));
  await db.exec('reset role');
  assert.equal((await db.query("select private.imp_floor('Keel',10::real,10::real) f")).rows[0].f,-2);
  assert.equal((await db.query("select private.imp_floor('Keel',385::real,108::real) f")).rows[0].f,-2);
 }finally{await db.close();}
});

test('Keel feedback round reaches each assigned station through walkable floors and ends in a crew win',async()=>{
 const {db,user,ids}=await create();
 try{
  await db.exec('reset role');
  await db.exec(fs.readFileSync(require.resolve('../supabase/upgrade-1.2.0.sql'),'utf8'));
  await db.exec(fs.readFileSync(require.resolve('../supabase/upgrade-keel-feedback.sql'),'utf8')); 
  await user(0);await assert.rejects(db.query("select imp_create('Caldera',1,10,1,30)"));
  const id=(await db.query("select imp_create('Keel',1,10,1,30) id")).rows[0].id;
  await db.exec('reset role');for(const uid of ids.slice(1,3))await db.query('insert into private.imp_seats(game,uid,joined) values($1,$2,true)',[id,uid]);
  await user(0);await db.query("select imp_action($1,'start','')",[id]);
  const {maps}=await import('../src/imposter-layout.js'),{floorAt}=await import('../src/imposter-scene.js');
  const map=maps.Keel,start=[350,94],queue=[start],key=(x,y)=>x+','+y,prev=new Map([[key(...start),null]]);
  const walkable=(x,y)=>[[0,0],[2,0],[-2,0],[0,2],[0,-2]].every(([a,b])=>floorAt(map,x+a,y+b)!==-2);
  const station=r=>[Math.round(r[1]/2)*2,Math.round((r[2]-r[4]*.24+8)/2)*2];
  for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(const [dx,dy] of [[2,0],[0,2],[-2,0],[0,-2]]){
    const k=key(x+dx,y+dy);if(!prev.has(k)&&walkable(x+dx,y+dy)){prev.set(k,[x,y]);queue.push([x+dx,y+dy]);}
  }}
  for(const r of map.rooms.slice(1))assert.ok(prev.has(key(...station(r))),r[0]+' station must be reachable from Cafe');
  let last;
  for(let i=0;i<3;i++){
   await user(i);const packet=(await db.query("select imp_action($1,'read','') p",[id])).rows[0].p;
   if(packet.me.role==='Imposter')continue;
   const path=[];let pos=station(map.rooms[packet.me.todo[0]]);
   while(pos){path.unshift(pos);pos=prev.get(key(...pos));}
   for(let j=0;j<path.length;){
    const [x,y]=path[j];await db.exec('reset role');
    await db.query("update private.imp_seats set walked_at=now()-interval '2 seconds',last_move=now()-interval '2 seconds' where game=$1 and uid=$2",[id,ids[i]]);await user(i);
    const step=(await db.query('select imp_walk($1,$2,$3) p',[id,x,y])).rows[0].p;assert.deepEqual(step,{x,y});
    if(j===path.length-1)break;
    const dx=path[j+1][0]-x,dy=path[j+1][1]-y;let n=j+1;
    while(n<path.length-1&&n-j<12&&path[n+1][0]-path[n][0]===dx&&path[n+1][1]-path[n][1]===dy)n++;j=n;
   }
   last=(await db.query("select imp_action($1,'task','') p",[id])).rows[0].p;
  }
  assert.equal(last.game.winner,'Innocent');
 }finally{await db.close();}
});
