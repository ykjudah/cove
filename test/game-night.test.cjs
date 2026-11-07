const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {create}=require('./live-backend.cjs');
test('poll removal, first-move acceptance, results, records and live calls',async()=>{
 const {db,user,room,ids,devices,rpc}=await create();
 try{
  await db.exec('reset role');
  for(const name of ['upgrade-1.6.15.sql','upgrade-game-night.sql'])await db.exec(fs.readFileSync(require.resolve('../supabase/'+name),'utf8'));
  await user(0);
  const poll=(await db.query("select create_game_night_item($1,'poll') id",[room])).rows[0].id;
  await db.exec('reset role');
  await db.exec(fs.readFileSync(require.resolve('../supabase/upgrade-1.0.0.sql'),'utf8'));
  await user(0);
  assert.ok((await db.query('select deleted_at from messages where id=$1',[poll])).rows[0].deleted_at);
  await assert.rejects(db.query("select game_night_vote($1,'four',false)",[poll]));
  const game=(await db.query('select create_four_game($1) id',[room])).rows[0].id;
  const drop=(col,rev)=>db.query('select drop_four_disc($1,$2,$3)',[game,col,rev]);
  await assert.rejects(drop(0,0));await user(1);await drop(0,0);await assert.rejects(drop(1,0));
  await user(2);await assert.rejects(drop(1,1));
  for(const [i,col,rev] of [[0,1,1],[1,0,2],[0,1,3],[1,0,4],[0,1,5],[1,0,6]]){await user(i);await drop(col,rev);}
  assert.equal((await db.query("select system_event->>'winner' w from messages where id=$1",[game])).rows[0].w,ids[1]);
  await user(2);assert.equal((await db.query('select id from messages where id=$1',[game])).rows.length,0);
  await user(0);assert.equal(Number((await db.query('select losses from head_to_head($1)',[ids[1]])).rows[0].losses),1);
  await user(1);assert.equal(Number((await db.query("select wins from game_leaderboard('four') where player_id=$1",[ids[1]])).rows[0].wins),1);
  assert.equal((await db.query('select * from active_chat_games($1)',[room])).rows.length,0);
  await user(0);
  await db.exec('reset role');
  await db.exec(fs.readFileSync(require.resolve('../supabase/upgrade-1.0.0.sql'),'utf8'));
  await user(1);
  assert.equal(Number((await db.query("select wins from game_leaderboard('four') where player_id=$1",[ids[1]])).rows[0].wins),1);
  await rpc(0,'live_call_action',{action:'start',device_id:devices[0],target_room:room});
  await user(2);assert.equal((await db.query('select * from joinable_chat_calls()')).rows[0].room_id,room);
  await user(3);assert.equal((await db.query('select * from joinable_chat_calls()')).rows.length,0);
 }finally{await db.close();}
});
