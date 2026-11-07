const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{create}=require('./live-backend.cjs');
test('finished game cards stay visible only to players, and starting calls leaves other calls',async()=>{
 const f=await create(),{db,ids,room,user,devices,rpc}=f;try{
 await db.exec('reset role');for(const file of ['upgrade-account-social.sql','upgrade-cove-game-results.sql','upgrade-cove-call-switch.sql'])await db.exec(fs.readFileSync(require.resolve('../supabase/'+file),'utf8'));
 await user(0);const game=(await db.query('select (create_pool_game($1)).id id',[room])).rows[0].id;
 await user(1);await db.query('select accept_pool_game($1)',[game]);
 await db.exec('reset role');await db.query("insert into private.game_wins(mode,game_id,winner) values('pool',$1,$2)",[game,ids[0]]);
 for(const i of [0,1]){await user(i);const rows=(await db.query("select system_event from messages where body=$1",['[[tungchat-pool:v1]]'+game])).rows;assert.equal(rows.length,1);assert.equal(rows[0].system_event.winner,ids[0]);}
 await user(2);assert.equal((await db.query('select id from messages where body=$1',['[[tungchat-pool:v1]]'+game])).rows.length,0);
 const first=await rpc(0,'live_call_action',{device_id:devices[0],action:'start',target_room:room});
 await user(0);const secondRoom=(await db.query("select create_group('Next',array['bobby']) id")).rows[0].id;
 const second=await rpc(0,'live_call_action',{device_id:devices[0],action:'start',target_room:secondRoom});assert.notEqual(second.id,first.id);
 await db.exec('reset role');assert.equal((await db.query('select status from private.live_call_members where call_id=$1 and user_id=$2',[first.id,ids[0]])).rows[0].status,'left');
 }finally{await db.close();}
});
