const {test}=require('node:test');
const assert=require('node:assert/strict');
const Golf=require('../src/mini-golf.cjs');
const Themes=require('../src/themes.cjs');
test('theme colors round-trip and settings clamp malformed saved values',()=>{
  for(const color of ['#ff00aa','#123456','#ffffff','#000000','#b9ef87'])assert.equal(Themes.hex(...Themes.hsv(color)),color);
  assert.deepEqual(Themes.normalize({mode:'invalid',colors:['bogus'],intensity:200}),{mode:'dark',colors:['#20b8c9'],intensity:100});
});
test('owner-assisted golf glides into each cup with deterministic replay and one stroke',()=>{
  for(let i=0;i<Golf.COURSES.length;i++){
    const state=Golf.initial(['a','b']);state.courseSet=3;state.holeCount=3;state.courseOrder=[i,(i+1)%Golf.COURSES.length,(i+2)%Golf.COURSES.length];
    // Course zero is a legacy course and excluded from modern random selections.
    if(state.courseOrder.includes(0))continue;
    const course=Golf.getCourse(state);state.balls=state.balls.map(b=>({...b,x:course.start[0],y:course.start[1]}));
    const shot={angle:0,power:.5,assist:true},end=Golf.simulate(state,shot,'a');
    assert.equal(end.balls[0].sunk,true);assert.equal(end.balls[0].x,course.cup[0]);assert.equal(end.scores[0][0],1);
    assert.equal(end.turn,'b');assert.deepEqual(end,Golf.simulate(JSON.parse(JSON.stringify(state)),shot,'a'));
  }
});
test('ring invitations expire after twenty seconds, late joining remains possible, room activity updates',async()=>{
  const {db,ids,devices,room,rpc,user}=await require('./live-backend.cjs').create();
  try{
    const result=await rpc(0,'live_call_action',{device_id:devices[0],action:'start',target_room:room,wants_video:false});
    await db.exec('reset role');
    await db.query("update private.live_calls set created_at=now()-interval '21 seconds' where id=$1",[result.id]);
    assert.equal(await rpc(1,'poll_live_calls',{device_id:devices[1]}),null);
    const current=await rpc(0,'poll_live_calls',{device_id:devices[0]});
    assert.equal(current.members.length,1);
    await rpc(1,'live_call_action',{device_id:devices[1],action:'start',target_room:room,wants_video:false});
    assert.equal((await rpc(0,'poll_live_calls',{device_id:devices[0]})).members.length,2);
    await db.exec('reset role');
    for(const ip of ['168.9.116.17','::ffff:168.9.116.17']){
      const fp=(ip.includes(':')?'d':'c').repeat(64);
      await db.query('insert into moderation_ip_events(user_id,ip_fingerprint) values($1,$2)',[ids[0],fp]);
      await db.query('select record_moderation_ip_event($1,$2,$3)',[ids[0],ip,fp]);
      assert.equal((await db.query('select count(*) n from moderation_ip_events where ip_fingerprint=$1',[fp])).rows[0].n,0);
    }
    await user(1);
    const game=(await db.query('select to_jsonb(create_golf_game($1,3)) g',[room])).rows[0].g;
    await user(0);
    const accepted=(await db.query('select to_jsonb(accept_golf_game($1)) g',[game.id])).rows[0].g;
    const shot={angle:0,power:.5,assist:true},end=Golf.simulate(accepted.state,shot,ids[0]);
    const submitted=(await db.query('select to_jsonb(submit_golf_shot($1,0,$2,$3)) g',[game.id,JSON.stringify(shot),JSON.stringify(end)])).rows[0].g;
    assert.equal(submitted.state.balls[0].sunk,true);
    await user(1);
    const opponentEnd=Golf.simulate(end,shot,ids[1]);
    await assert.rejects(db.query('select submit_golf_shot($1,1,$2,$3)',[game.id,JSON.stringify(shot),JSON.stringify(opponentEnd)]),/Owner access/);
    await db.exec('reset role');
    await db.query("update rooms set last_activity_at=now()-interval '1 day' where id=$1",[room]);
    await db.query("insert into messages(room_id,sender_id,body) values($1,$2,'activity')",[room,ids[0]]);
    assert.equal((await db.query("select last_activity_at>now()-interval '1 minute' recent from rooms where id=$1",[room])).rows[0].recent,true);
  }finally{await db.close();}
});
