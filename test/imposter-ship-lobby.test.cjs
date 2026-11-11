const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {create}=require('./live-backend.cjs');

test('walkable ship lobby supports movement, cosmetics and a second round',async()=>{
 const {db,user,ids}=await create();
 try{
  await db.exec('reset role');
  for(const file of [
   'upgrade-imposter.sql','upgrade-imposter-walk.sql','upgrade-keel-feedback.sql',
   'upgrade-imposter-smooth-movement.sql','upgrade-imposter-lobby-controls.sql',
   'upgrade-imposter-ship-lobby.sql'
  ])await db.exec(fs.readFileSync(require.resolve('../supabase/'+file),'utf8'));
  await user(0);
  const g=(await db.query(
   'select imp_create_v2($1,$2,$3,$4,$5,$6,$7) id',
   ['Keel',1,5,2,20,'Walking Crew',30])).rows[0].id;
  const act=async(i,kind,arg='')=>{
   await user(i);
   return (await db.query('select imp_action_v2($1,$2,$3) p',[g,kind,arg])).rows[0].p;
  };
  const host=await act(0,'read');
  assert.equal(host.game.phase,'lobby');
  assert.ok(Number.isFinite(host.me.x)&&Number.isFinite(host.me.y),'host spawns in the ship');
  const guest=await act(1,'join');
  assert.equal(guest.game.phase,'lobby');
  assert.ok(Number.isFinite(guest.me.x)&&Number.isFinite(guest.me.y),'joining player spawns in the ship');
  const joinThird=await act(2,'join');
  assert.ok(Number.isFinite(joinThird.me.x)&&Number.isFinite(joinThird.me.y));

  // Walk before match start, with the same revisioned movement RPC as live games.
  await user(0);
  const ack=(await db.query('select imp_steps_v2($1,$2,$3) p',
    [g,host.me.move_rev,JSON.stringify([[.4,0],[.4,0]])])).rows[0].p;
  assert.equal(ack.revision,host.me.move_rev+1);
  assert.ok(Math.abs(ack.x-host.me.x)>.1);
  const positions=(await db.query('select imp_nearby($1) p',[g])).rows[0].p;
  assert.ok(positions.some(p=>p.uid===ids[0]));
  assert.ok(positions.some(p=>p.uid===ids[1]));
  assert.ok(positions.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));

  const look=await act(0,'cosmetic',JSON.stringify({suit:8,hat:'sprout'}));
  assert.equal(look.me.suit,8);
  assert.equal(look.me.hat,'sprout');
  const other=await act(1,'read');
  assert.equal(other.players.find(p=>p.uid===ids[0]).hat,'sprout');
  await assert.rejects(act(1,'cosmetic',JSON.stringify({suit:8,hat:'cap'})),/already taken/);

  const game=await act(0,'start');
  assert.equal(game.game.phase,'play');
  assert.equal(game.game.round_number,1);
  const nextStep=await db.query('select imp_steps_v2($1,$2,$3) p',
    [g,game.me.move_rev,JSON.stringify([[.3,0]])]);
  assert.equal(nextStep.rows[0].p.revision,game.me.move_rev+1);

  await db.exec('reset role');
  await db.query("update private.imp_games set phase='finished',winner='Innocent',round_ends_at=clock_timestamp()-interval '1 second' where id=$1",[g]);
  const returned=await act(0,'read');
  assert.equal(returned.game.phase,'lobby');
  assert.equal(returned.me.hat,'sprout');
  await user(0);
  const resumed=(await db.query('select imp_steps_v2($1,$2,$3) p',
    [g,returned.me.move_rev,JSON.stringify([[.2,0]])])).rows[0].p;
  assert.equal(resumed.revision,returned.me.move_rev+1);
  const again=await act(0,'start');
  assert.equal(again.game.round_number,2);
  await act(0,'close');
 }finally{await db.close();}
});

test('imposter client keeps the live scene during ship lobby customization',()=>{
 const ui=fs.readFileSync(require.resolve('../src/imposter.js'),'utf8');
 const start=ui.indexOf("if(game.phase==='lobby'){");
 const finish=ui.indexOf("if(game.phase==='finished'){",start);
 assert.ok(start!==-1&&finish>start);
 const lobby=ui.slice(start,finish);
 assert.match(lobby,/ensureScene\(data\)/);
 assert.match(lobby,/ship\.canvas/);
 assert.match(lobby,/perform\('cosmetic'/);
 assert.match(lobby,/button\('Start match'/);
 assert.match(lobby,/kickPlayer/);
 assert.match(ui,/if\(!\['play','lobby'\]\.includes\(data\.game\.phase\)\)/);
});
