const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {create}=require('./live-backend.cjs');

test('private multiplayer lobby, host controls, reporting, voting and victory',async()=>{
 const {db,ids,user}=await create();
 try{
  await db.exec('reset role');
  await db.exec(fs.readFileSync(require.resolve('../supabase/upgrade-imposter.sql'),'utf8'));
  for(let i=1;i<4;i++)await db.query("insert into public.friendships(sender_id,recipient_id,status) values($1,$2,'accepted')",[ids[0],ids[i]]);
  await user(0);
  const game=(await db.query("select imp_create('Keel',1,5,2,20) id")).rows[0].id;
  const act=async(i,action,arg='')=>{await user(i);return (await db.query('select imp_action($1,$2,$3) packet',[game,action,arg])).rows[0].packet;};
  await assert.rejects(act(1,'read'));
  await assert.rejects(act(0,'start'));
  for(let i=1;i<4;i++){await act(0,'invite',ids[i]);await act(i,'join');}
  await assert.rejects(act(1,'start'));
  await act(0,'configure',JSON.stringify({map:'Caldera',imposters:1,cooldown:5,tasks:2,vote_seconds:20}));
  await act(0,'start');
  const states=[];for(let i=0;i<4;i++)states.push(await act(i,'read'));
  const imp=states.findIndex(s=>s.me.role==='Imposter'),good=[0,1,2,3].filter(i=>i!==imp);
  assert.equal(states[good[0]].players.find(p=>p.uid===ids[imp]).role,null);
  await assert.rejects(db.query('select * from private.imp_seats'));
  await assert.rejects(act(good[0],'kill',ids[imp]));await assert.rejects(act(imp,'kill',ids[good[0]]));
  await db.exec('reset role');await db.query("update private.imp_seats set next_kill=now(),last_move=now()-interval '10 seconds' where game=$1",[game]);
  await assert.rejects(act(good[0],'move','8'));
  await act(imp,'kill',ids[good[0]]);
  await act(good[0],'move','1');
  assert.ok((await act(good[1],'read')).players.find(p=>p.uid===ids[good[0]]).body);
  await act(good[1],'report');await assert.rejects(act(good[0],'vote',ids[imp]));
  await act(good[2],'say','I saw the imposter in Cafe.');
  await act(good[1],'vote',ids[imp]);await act(good[2],'vote',ids[imp]);
  assert.equal((await act(imp,'vote','skip')).game.winner,'Innocent');
  assert.equal((await act(good[2],'read')).game.phase,'finished');
 }finally{await db.close();}
});

test('sabotage, corridor timing, task victory and imposter parity',async()=>{
 const {db,ids,user}=await create();
 try{
  await db.exec('reset role');
  await db.exec(fs.readFileSync(require.resolve('../supabase/upgrade-1.1.0.sql'),'utf8'));
  for(const i of [1,2])await db.query("insert into public.friendships(sender_id,recipient_id,status) values($1,$2,'accepted')",[ids[0],ids[i]]);
  for(const map of ['Keel','Frostline']){
   await user(0);const g=(await db.query('select imp_create($1,1,5,1,15) id',[map])).rows[0].id;
   const act=async(i,a,arg='')=>{await user(i);return (await db.query('select imp_action($1,$2,$3) p',[g,a,String(arg)])).rows[0].p;};
   for(const i of [1,2]){await act(0,'invite',ids[i]);await act(i,'join');}
   await act(0,'start');const states=[];for(const i of [0,1,2])states.push(await act(i,'read'));
   const imp=states.findIndex(p=>p.me.role==='Imposter'),crew=[0,1,2].filter(i=>i!==imp);
   async function ready(i){await db.exec('reset role');await db.query("update private.imp_seats set next_kill=now(),arrive_at=now(),last_move=now()-interval '2 seconds' where game=$1 and uid=$2",[g,ids[i]]);}
   if(map==='Frostline'){await ready(imp);assert.equal((await act(imp,'kill',ids[crew[0]])).game.winner,'Imposter');continue;}
   assert.equal((await act(imp,'sabotage')).game.lights_out,true);
   await assert.rejects(act(crew[0],'task'));await assert.rejects(act(crew[0],'repair'));
   const routes=[[0,1],[0,2],[0,3],[1,4],[4,5],[5,3],[3,6],[6,7],[7,2],[2,8],[8,6]];
   async function go(i,target){
    const start=(await act(i,'read')).me.room,queue=[[start]],seen=new Set([start]);
    while(queue.length){const path=queue.shift(),last=path.at(-1);if(last===target){for(const dest of path.slice(1)){await ready(i);await act(i,'move',dest);await assert.rejects(act(i,'move',last));}await ready(i);return;}
     for(const pair of routes.filter(e=>e.includes(last))){const next=pair.find(n=>n!==last);if(!seen.has(next)){seen.add(next);queue.push([...path,next]);}}}
    throw Error('Unreachable room');
   }
   await go(crew[0],5);assert.equal((await act(crew[0],'repair')).game.lights_out,false);
   let result;for(const i of crew){await go(i,states[i].me.todo[0]);result=await act(i,'task');}
   assert.equal(result.game.winner,'Innocent');
  }
 }finally{await db.close();}
});
