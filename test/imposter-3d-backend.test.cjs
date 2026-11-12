const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {create}=require('./live-backend.cjs');

test('3D shuttle walking, expanded cosmetics, vents and wire repair coexist with v2 lobbies',async()=>{
 const {db,user,ids}=await create();
 try{
  await db.exec('reset role');
  for(const file of [
   'upgrade-imposter.sql','upgrade-imposter-walk.sql','upgrade-keel-feedback.sql',
   'upgrade-imposter-smooth-movement.sql','upgrade-imposter-lobby-controls.sql',
   'upgrade-imposter-ship-lobby.sql','upgrade-imposter-3d-compat.sql'
  ])await db.exec(fs.readFileSync(require.resolve('../supabase/'+file),'utf8'));
  const act=async(i,g,kind,arg='')=>{
   await user(i);
   return (await db.query('select public.imp_3d_action($1,$2,$3) p',[g,kind,arg])).rows[0].p;
  };
  await user(0);
  const g=(await db.query('select public.imp_create_3d($1,$2,$3,$4,$5,$6,$7) id',
    ['Keel',1,5,2,20,'Original 3D Ship',30])).rows[0].id;
  await act(1,g,'join');await act(2,g,'join');await act(3,g,'join');
  const lobby=await act(0,g,'read');
  assert.equal(lobby.game.phase,'lobby');
  await user(0);
  const walked=(await db.query('select public.imp_steps_3d($1,$2,$3) p',
    [g,lobby.me.move_rev,JSON.stringify([[0.3,0],[0.3,0]])])).rows[0].p;
  assert.equal(walked.revision,lobby.me.move_rev+1);
  assert.ok(walked.x>lobby.me.x);
  const cosmetic=await act(0,g,'cosmetic',JSON.stringify({suit:8,hat:'banana'}));
  assert.equal(cosmetic.me.hat,'banana');
  const config=await act(0,g,'configure',JSON.stringify({
   map:'Keel',imposters:1,cooldown:5,tasks:2,vote_seconds:20,
   name:'Original 3D Ship',meeting_cooldown:30,vent_cooldown:10
  }));
  assert.equal(config.game.vent_cooldown,10);
  await assert.rejects(act(1,g,'cosmetic',JSON.stringify({suit:8,hat:'cat'})),/already taken/);
  const started=await act(0,g,'start');
  assert.equal(started.game.phase,'play');
  assert.equal(started.game.round_number,1);
  await db.exec('reset role');
  const rows=(await db.query('select uid,role from private.imp_seats where game=$1',[g])).rows;
  const killer=rows.find(x=>x.role==='Imposter');
  const innocent=rows.find(x=>x.role==='Innocent');
  const ki=ids.indexOf(killer.uid),vi=ids.indexOf(innocent.uid);
  await db.exec('reset role');
  await db.query('update private.imp_seats set x=150,y=112,room=1,vent_ready_at=null where game=$1 and uid=$2',[g,killer.uid]);
  const vent=await act(ki,g,'vent_enter','0');
  assert.equal(vent.me.vent_node,0);
  await assert.rejects(act(ki,g,'kill_nearest'),/Exit vent/);
  await user(vi);
  const nearby=(await db.query('select public.imp_nearby($1) p',[g])).rows[0].p;
  assert.equal(nearby.some(x=>x.uid===killer.uid),false,'vented players stay hidden');
  const moved=await act(ki,g,'vent_travel','1');
  assert.equal(moved.me.vent_node,1);
  const exited=await act(ki,g,'vent_exit');
  assert.equal(exited.me.vent_node,null);
  assert.equal(exited.me.room,5);
  assert.equal(exited.me.x,198);
  await assert.rejects(act(ki,g,'vent_enter','1'),/cooldown/i);
  await db.exec('reset role');
  await db.query('update private.imp_games set lights_out=true where id=$1',[g]);
  await db.query('update private.imp_seats set x=166,y=297,room=5 where game=$1 and uid=$2',[g,innocent.uid]);
  const puzzle=await act(vi,g,'repair_begin');
  assert.equal(puzzle.me.repair_order.length,4);
  assert.equal(new Set(puzzle.me.repair_order).size,4);
  const connections=[0,1,2,3].map(i=>puzzle.me.repair_order.indexOf(i));
  const repaired=await act(vi,g,'repair',JSON.stringify({
   token:puzzle.me.repair_token,connections
  }));
  assert.equal(repaired.game.lights_out,false);
  await db.exec('reset role');
  await db.query("update private.imp_games set phase='finished',winner='Innocent',round_ends_at=clock_timestamp()-interval '1 second' where id=$1",[g]);
  const back=await act(0,g,'read');
  assert.equal(back.game.phase,'lobby');
  const again=await act(0,g,'start');
  assert.equal(again.game.round_number,2);
 }finally{await db.close();}
});


test('Keel-only ship, persistent rounds, vote recap and meeting cooldown',async()=>{
 const {db,user,ids}=await create();
 try{
  await db.exec('reset role');
  for(const file of ['upgrade-imposter.sql','upgrade-imposter-walk.sql',
   'upgrade-keel-feedback.sql','upgrade-imposter-smooth-movement.sql',
   'upgrade-imposter-lobby-controls.sql','upgrade-imposter-ship-lobby.sql',
   'upgrade-imposter-3d-compat.sql'])
   await db.exec(fs.readFileSync(require.resolve('../supabase/'+file),'utf8'));
  await user(1);
  await assert.rejects(db.query('select public.imp_create_3d($1,$2,$3,$4,$5,$6,$7) g',
   ['Caldera',1,5,2,20,'No extra maps',30]),/Keel is the only available map/);
  const g=(await db.query('select public.imp_create_3d($1,$2,$3,$4,$5,$6,$7) g',
   ['Keel',1,5,2,20,'Walkable Ship',30])).rows[0].g;
  const run=async(i,act,arg='')=>{
   await user(i);
   return (await db.query('select public.imp_3d_action($1,$2,$3) x',[g,act,arg])).rows[0].x;
  };
  await run(0,'join');await run(2,'join');
  let state=await run(1,'read');
  assert.equal(state.game.map,'Keel');
  assert.equal(state.game.phase,'lobby');
  assert.equal(state.game.name,'Walkable Ship');
  assert.ok(Math.abs(state.me.x-350)<52,'host begins inside authentic 3D shuttle');
  const settings={map:'Keel',imposters:1,tasks:2,cooldown:5,vote_seconds:20,
   meeting_cooldown:30,vent_cooldown:10,name:'Renamed Ship'};
  await assert.rejects(run(1,'configure',JSON.stringify({...settings,map:'Frostline'})),/Keel/);
  state=await run(1,'configure',JSON.stringify(settings));
  assert.equal(state.game.name,'Renamed Ship');
  assert.equal(state.game.meeting_cooldown,30);
  await assert.rejects(run(2,'configure',JSON.stringify(settings)),/Only the host/);
  const first=await run(1,'start');
  assert.equal(first.game.phase,'play');
  assert.equal(first.game.round_number,1);
  await assert.rejects(run(1,'meeting'),/cooldown/i);
  await db.exec('reset role');
  await db.query("update private.imp_games set meeting_ready_at=clock_timestamp()-interval '1 second' where id=$1",[g]);
  const meeting=await run(1,'meeting');
  assert.equal(meeting.game.phase,'meeting');
  const vote1=await run(1,'vote','skip');
  assert.ok(vote1.votes.some(v=>v.uid===ids[1]&&v.choice==='skip'));
  await run(0,'vote','skip');
  const votes=await run(2,'vote','skip');
  assert.equal(votes.game.phase,'play');
  assert.equal(votes.game.last_votes.length,3);
  assert.deepEqual(new Set(votes.game.last_votes.map(v=>v.uid)),new Set([ids[0],ids[1],ids[2]]));
  assert.ok(votes.game.last_votes.every(v=>v.choice==='skip'));
  await db.exec('reset role');
  await db.query("update private.imp_games set phase='finished',winner='Innocent',round_ends_at=clock_timestamp()-interval '1 second' where id=$1",[g]);
  state=await run(1,'read');
  assert.equal(state.game.phase,'lobby');
  assert.equal(state.game.name,'Renamed Ship');
  assert.equal(state.game.round_number,1);
  const next=await run(1,'start');
  assert.equal(next.game.round_number,2,'host can start another round without recreating lobby');
  await run(1,'close');
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from private.imp_games where id=$1',[g])).rows[0].n,0);
 }finally{await db.close();}
});

test('admin can delete someone else’s open lobby, regular users cannot',async()=>{
 const {db,user}=await create();
 try{
  await db.exec('reset role');
  for(const file of ['upgrade-imposter.sql','upgrade-imposter-walk.sql',
   'upgrade-keel-feedback.sql','upgrade-imposter-smooth-movement.sql',
   'upgrade-imposter-lobby-controls.sql','upgrade-imposter-ship-lobby.sql',
   'upgrade-imposter-3d-compat.sql'])
   await db.exec(fs.readFileSync(require.resolve('../supabase/'+file),'utf8'));
  await user(1);
  const g=(await db.query('select public.imp_create_3d($1,$2,$3,$4,$5,$6,$7) g',
   ['Keel',1,5,2,20,'Other Host Game',30])).rows[0].g;
  await user(2);
  await assert.rejects(db.query('select public.imp_delete_game($1)',[g]),/Admin access required/);
  await user(0);
  const listed=(await db.query('select * from public.imp_list_v2() where id=$1',[g])).rows;
  assert.equal(listed.length,1);
  assert.equal(listed[0].is_admin,true);
  await db.query('select public.imp_delete_game($1)',[g]);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from private.imp_games where id=$1',[g])).rows[0].n,0);
 }finally{await db.close();}
});

test('one server-authoritative kill picks closest available victim',async()=>{
 const {db,user,ids}=await create();
 try{
  await db.exec('reset role');
  for(const file of ['upgrade-imposter.sql','upgrade-imposter-walk.sql',
   'upgrade-keel-feedback.sql','upgrade-imposter-smooth-movement.sql',
   'upgrade-imposter-lobby-controls.sql','upgrade-imposter-ship-lobby.sql',
   'upgrade-imposter-3d-compat.sql'])
   await db.exec(fs.readFileSync(require.resolve('../supabase/'+file),'utf8'));
  await user(1);
  const g=(await db.query('select public.imp_create_3d($1,$2,$3,$4,$5,$6,$7) g',
   ['Keel',1,5,2,20,'Kill Test',30])).rows[0].g;
  const run=async(i,act,arg='')=>{
   await user(i);
   return (await db.query('select public.imp_3d_action($1,$2,$3) x',[g,act,arg])).rows[0].x;
  };
  await run(0,'join');await run(2,'join');await run(1,'start');
  await db.exec('reset role');
  await db.query("update private.imp_seats set role=case when uid=$2 then 'Imposter' else 'Innocent' end,x=case when uid=$2 then 350 when uid=$3 then 352 else 357 end,y=94,room=0,alive=true,body=false,next_kill=clock_timestamp()-interval '1 second' where game=$1",[g,ids[1],ids[0]]);
  const hit=await run(1,'kill_nearest');
  assert.equal(hit.players.find(p=>p.uid===ids[0]).alive,false,'closest player was killed');
  assert.equal(hit.players.find(p=>p.uid===ids[2]).alive,true,'farther player survived');
  await assert.rejects(run(1,'kill_nearest'),/cooldown|Kill unavailable/i);
 }finally{await db.close();}
});
