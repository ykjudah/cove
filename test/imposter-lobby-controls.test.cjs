const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {create}=require('./live-backend.cjs');

test('Imposter v2 lobbies persist across rounds, track votes, enforce cooldowns and host kicks',async()=>{
 const {db,user,ids}=await create();
 try{
  await db.exec('reset role');
  for(const file of ['upgrade-imposter.sql','upgrade-imposter-walk.sql',
   'upgrade-keel-feedback.sql','upgrade-imposter-smooth-movement.sql',
   'upgrade-imposter-lobby-controls.sql']){
   await db.exec(fs.readFileSync(require.resolve('../supabase/'+file),'utf8'));
  }
  const createLobby=async(i,name)=>{
   await user(i);
   return (await db.query(
    'select imp_create_v2($1,$2,$3,$4,$5,$6,$7) id',
    ['Keel',1,5,2,20,name,30])).rows[0].id;
  };
  const act=async(i,g,a,arg='')=>{
   await user(i);
   return (await db.query('select imp_action_v2($1,$2,$3) p',[g,a,arg])).rows[0].p;
  };
  const g=await createLobby(0,'Friday Crew');
  for(const i of [1,2,3])await act(i,g,'join');
  const settings=JSON.stringify({map:'Keel',imposters:1,cooldown:5,
   tasks:2,vote_seconds:20,meeting_cooldown:60,name:'Friday Crew Reloaded'});
  const configured=await act(0,g,'configure',settings);
  assert.equal(configured.game.name,'Friday Crew Reloaded');
  assert.equal(configured.game.meeting_cooldown,60);
  await user(1);
  const listed=(await db.query('select * from imp_list_v2()')).rows.find(x=>x.id===g);
  assert.equal(listed.name,'Friday Crew Reloaded');
  assert.equal(listed.joined,true);
  assert.equal(listed.is_admin,false);

  const started=await act(0,g,'start');
  assert.equal(started.game.phase,'play');
  assert.equal(started.game.round_number,1);
  await assert.rejects(act(0,g,'meeting'),/cooldown/i);

  await db.exec('reset role');
  await db.query("update private.imp_games set meeting_ready_at=clock_timestamp()-interval '1 second' where id=$1",[g]);
  const meeting=await act(0,g,'meeting');
  assert.equal(meeting.game.phase,'meeting');
  await act(0,g,'vote','skip');
  const voting=await act(1,g,'vote',ids[2]);
  assert.ok(voting.votes.some(v=>v.uid===ids[0]&&v.choice==='skip'));
  assert.ok(voting.votes.some(v=>v.uid===ids[1]&&v.choice===ids[2]));
  await act(2,g,'vote','skip');
  const resolved=await act(3,g,'vote','skip');
  assert.equal(resolved.game.phase,'play');
  assert.equal(resolved.game.last_votes.length,4);
  await assert.rejects(act(1,g,'meeting'),/cooldown/i);

  await assert.rejects(act(1,g,'kick',ids[3]),/Only the host/i);
  const afterKick=await act(0,g,'kick',ids[3]);
  assert.ok(afterKick.players.every(p=>p.uid!==ids[3]));
  await assert.rejects(act(3,g,'join'));
  await user(3);
  await assert.rejects(db.query("select imp_action($1,'join','')",[g]));
  assert.equal((await db.query('select * from imp_list_v2()')).rows.some(r=>r.id===g),false);

  await db.exec('reset role');
  await db.query("update private.imp_games set phase='finished',winner='Innocent',round_ends_at=clock_timestamp()-interval '1 second' where id=$1",[g]);
  const returned=await act(0,g,'read');
  assert.equal(returned.game.phase,'lobby');
  assert.equal(returned.game.name,'Friday Crew Reloaded');
  await db.exec('reset role');
  const seats=(await db.query('select alive,role from private.imp_seats where game=$1',[g])).rows;
  assert.ok(seats.every(p=>p.alive&&p.role==null));
  assert.equal(returned.game.round_number,1);
  await assert.rejects(act(3,g,'join'),/Lobby unavailable|Join|Invitation|Unavailable/i);
  await user(3);
  await assert.rejects(db.query("select imp_action($1,'join','')",[g]),/Lobby unavailable/i);
  const next=await act(0,g,'start');
  assert.equal(next.game.phase,'play');
  assert.equal(next.game.round_number,2);

  const second=await createLobby(1,'Another Game');
  await user(2);
  await assert.rejects(db.query('select imp_delete_game($1)',[second]),/Admin access required/);
  await user(0);
  await db.query('select imp_delete_game($1)',[second]);
  assert.equal((await db.query('select count(*)::int n from private.imp_games where id=$1',[second])).rows[0].n,0);

  await assert.rejects(act(1,g,'close'),/Only the host/i);
  await act(0,g,'close');
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from private.imp_games where id=$1',[g])).rows[0].n,0);
 }finally{
  await db.close();
 }
});
