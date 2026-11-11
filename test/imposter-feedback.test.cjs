const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {create}=require('./live-backend.cjs');
test('public lobbies, unique cosmetics, sequenced corner movement, visibility and fixed corpses',async()=>{
 const {db,user,ids}=await create();
 try{
  await db.exec('reset role');
  for(const file of ['upgrade-imposter.sql','upgrade-imposter-walk.sql','upgrade-keel-feedback.sql','upgrade-keel-feedback.sql','upgrade-imposter-smooth-movement.sql'])await db.exec(fs.readFileSync(require.resolve('../supabase/'+file),'utf8'));
  await user(0);const id=(await db.query("select imp_create('Keel',1,5,2,20) id")).rows[0].id;
  const act=async(i,a,arg='')=>{await user(i);return (await db.query('select imp_action($1,$2,$3) p',[id,a,arg])).rows[0].p;};
  await user(3);assert.equal((await db.query('select * from imp_list()')).rows[0].joined,false);
  await assert.rejects(act(3,'read'));
  for(const i of [1,2,3])await act(i,'join');
  const lobby=await act(0,'read');assert.equal(new Set(lobby.players.map(p=>p.suit)).size,4);
  await assert.rejects(act(0,'cosmetic',JSON.stringify({suit:lobby.players.find(p=>p.uid===ids[1]).suit,hat:'cap'})));
  const look=await act(0,'cosmetic',JSON.stringify({suit:8,hat:'sprout'}));assert.equal(look.me.hat,'sprout');assert.equal(look.players.find(p=>p.uid===ids[0]).suit,8);
  await act(0,'start');await assert.rejects(act(0,'cosmetic',JSON.stringify({suit:8,hat:'cap'})));
  // When the movement allowance is exhausted, the whole batch is deferred.
  // Clients must never drop unprocessed steps or advance the revision.
  await db.exec('reset role');
  await db.query("update private.imp_seats set move_credit=0,walked_at=clock_timestamp()+interval '1 second' where game=$1 and uid=$2",[id,ids[0]]);
  await user(0);
  const before=(await act(0,'read')).me;
  const deferred=(await db.query('select imp_steps_v2($1,$2,$3::jsonb) p',[id,before.move_rev,JSON.stringify([[.5,0],[.5,0]])])).rows[0].p;
  assert.deepEqual(deferred,{x:before.x,y:before.y,revision:before.move_rev});
  await db.exec('reset role');
  await db.query('update private.imp_seats set move_credit=39,walked_at=clock_timestamp() where game=$1 and uid=$2',[id,ids[0]]);
  await user(0);
  const accepted=(await db.query('select imp_steps_v2($1,$2,$3::jsonb) p',[id,before.move_rev,JSON.stringify([[.5,0],[.5,0]])])).rows[0].p;
  assert.equal(accepted.revision,before.move_rev+1);
  assert.ok(Math.abs(accepted.x-before.x-1)<.01);
  assert.equal(accepted.y,before.y);
  // Turn at the elbow, where the endpoint chord cuts across the outside wall.
  await db.exec('reset role');await db.query("update private.imp_seats set x=125,y=138,room=-1,move_credit=39,walked_at=clock_timestamp() where game=$1 and uid=$2",[id,ids[0]]);
  await user(0);let me=(await act(0,'read')).me;
  const steps=[...Array.from({length:12},()=>[0,1]),...Array.from({length:18},()=>[-1,0])];
  const walk=async(rev,path)=>(await db.query('select imp_steps_v2($1,$2,$3::jsonb) p',[id,rev,JSON.stringify(path)])).rows[0].p;
  const end=await walk(me.move_rev,steps);assert.equal(end.x,107);assert.equal(end.y,150);
  assert.deepEqual(await walk(me.move_rev,steps),end,'retry must not apply movement twice');
  await assert.rejects(walk(end.revision,[[99,0]]));
  await db.exec('reset role');await db.query('update private.imp_seats set x=110,y=150,room=-1 where game=$1 and uid=$2',[id,ids[1]]);
  await user(1);const nearby=(await db.query('select imp_nearby($1) p',[id])).rows[0].p.find(p=>p.uid===ids[0]);assert.equal(nearby.x,end.x);assert.equal(nearby.y,end.y);
  // The exact floor geometry must agree on client and server, including room doors.
  const {maps}=await import('../src/imposter-layout.js'),{floorAt}=await import('../src/imposter-scene.js');
  await db.exec('reset role');
  const grid=(await db.query("select x,y,private.imp_surface('Keel',x,y,true) f from generate_series(30,690,13)x cross join generate_series(45,370,11)y")).rows;
  for(const p of grid)assert.equal(floorAt(maps.Keel,p.x,p.y),p.f,JSON.stringify(p));
  const seats=(await db.query('select * from private.imp_seats where game=$1',[id])).rows,killer=seats.find(s=>s.role==='Imposter'),victim=seats.find(s=>s.role==='Innocent'),witness=seats.find(s=>s.role==='Innocent'&&s.uid!==victim.uid);
  for(const s of [killer,victim,witness])await db.query("update private.imp_seats set x=350,y=94,room=0,next_kill=now()-interval '1 second' where game=$1 and uid=$2",[id,s.uid]);
  await act(ids.indexOf(killer.uid),'kill',victim.uid);
  const dead=await act(ids.indexOf(victim.uid),'read');assert.equal(dead.me.alive,false);const bx=dead.me.bx,by=dead.me.by;
  await walk(dead.me.move_rev,[[1,0]]);
  const ghost=await act(ids.indexOf(victim.uid),'read');assert.equal(ghost.me.bx,bx);assert.equal(ghost.me.by,by);assert.notEqual(ghost.me.x,bx);
  const seen=await act(ids.indexOf(witness.uid),'read');assert.ok(seen.players.some(p=>p.uid===victim.uid&&p.body&&p.x===bx));
  const meeting=await act(ids.indexOf(witness.uid),'report');assert.equal(meeting.game.phase,'meeting');
  assert.ok(meeting.players.every(p=>!p.body));
 }finally{await db.close();}
});
