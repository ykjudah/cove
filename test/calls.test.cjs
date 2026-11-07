const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
test('calls: participant authorization, acceptance, devices, busy, signaling, expiry, blocks and relay limits',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create table public.rooms(id uuid primary key,kind text);create table public.room_members(room_id uuid,user_id uuid);
 create table private.blocks(a uuid,b uuid);
 create function private.is_member(r uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.room_members where room_id=r and user_id=auth.uid())$$;
 create function private.people_blocked(x uuid,y uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from private.blocks where (a=x and b=y) or (a=y and b=x))$$;`);
 const sql=fs.readFileSync(require.resolve('../supabase/upgrade-calls.sql'),'utf8');await db.exec(sql);await db.exec(sql);
 const [a,b,c,da,dbb,dc,r,g,id]=Array.from({length:9},randomUUID);
 for(const u of[a,b,c])await db.query('insert into auth.users values($1)',[u]);
 await db.query("insert into rooms values($1,'dm'),($2,'group')",[r,g]);for(const u of[a,b]){await db.query('insert into room_members values($1,$2),($3,$2)',[r,u,g]);}
 const user=async u=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated');};
 const act=async(device,action,call=id,room=null,desc=null)=>(await db.query('select call_action($1,$2,$3,$4,true,$5) c',[call,device,action,room,desc])).rows[0].c;
 const poll=async device=>(await db.query('select poll_calls($1) c',[device])).rows[0].c;
 await user(c);await assert.rejects(act(dc,'start',randomUUID(),r),/direct message/);assert.equal(await poll(dc),null);
 await user(a);await assert.rejects(act(da,'start',randomUUID(),g),/direct message/);
 let call=await act(da,'start',id,r);assert.equal(call.callee,b);assert.equal(call.status,'ringing');assert.equal((await act(da,'start',id,r)).id,id);
 await assert.rejects(act(da,'start',randomUUID(),r),/already in a call/);
 await assert.rejects(act(da,'accept'),/no longer available/);
 const offer={type:'offer',sdp:'v=0\r\ntest offer data'},answer={type:'answer',sdp:'v=0\r\ntest answer data'};
 await assert.rejects(act(da,'offer',id,null,offer),/no longer available/);
 await user(c);await assert.rejects(act(dc,'end'),/unavailable/);await assert.rejects(db.query('select * from private.calls'));await assert.rejects(db.query('select private.clean_calls()'));
 await user(b);assert.equal((await poll(dbb)).id,id);call=await act(dbb,'accept');assert.equal(call.status,'accepted');assert.equal(await poll(dc),null,'other device cannot attach to accepted call');
 await assert.rejects(act(dc,'end'),/another device/);await assert.rejects(act(dbb,'offer',id,null,offer),/another device/);
 await assert.rejects(act(dbb,'answer',id,null,answer),/another device/);
 await user(a);await assert.rejects(act(da,'offer',id,null,{type:'answer',sdp:'invalid description'}),/Invalid/);
 await assert.rejects(act(da,'offer',id,null,{type:'offer'}),/Invalid/);
 await act(da,'offer',id,null,offer);await assert.rejects(act(da,'offer',id,null,offer),/changed/);
 await user(b);assert.deepEqual((await poll(dbb)).offer,offer);await act(dbb,'answer',id,null,answer);
 assert.equal((await db.query('select authorize_call_relay($1,$2) ok',[id,dbb])).rows[0].ok,true);
 assert.equal((await db.query('select authorize_call_relay($1,$2) ok',[id,dbb])).rows[0].ok,false);
 await user(c);assert.equal((await db.query('select authorize_call_relay($1,$2) ok',[id,dc])).rows[0].ok,false);
 await user(a);assert.deepEqual((await poll(da)).answer,answer);await act(da,'end');assert.equal(await poll(da),null);
 await db.exec('reset role');let ended=(await db.query('select * from private.calls where id=$1',[id])).rows[0];assert.equal(ended.offer,null);assert.equal(ended.answer,null);
 await user(a);const id2=randomUUID();await act(da,'start',id2,r);await user(b);await act(dbb,'end',id2);assert.equal(await poll(dbb),null,'decline ends invitation');
 await user(a);const id3=randomUUID();await act(da,'start',id3,r);await db.exec('reset role');await db.query("update private.calls set created_at=now()-interval '46 seconds' where id=$1",[id3]);await user(b);assert.equal(await poll(dbb),null,'ring timeout');
 await user(a);const id4=randomUUID();await act(da,'start',id4,r);await user(b);await act(dbb,'accept',id4);await db.exec('reset role');await db.query('insert into private.blocks values($1,$2)',[a,b]);await user(b);assert.equal(await poll(dbb),null,'blocking ends call');await assert.rejects(act(dbb,'start',randomUUID(),r),/unavailable/);
 await db.exec('reset role');await db.exec('delete from private.blocks');await user(b);const id5=randomUUID();await act(dbb,'start',id5,r);await user(a);await act(da,'accept',id5);await db.exec('reset role');await db.query("update private.calls set caller_seen=now()-interval '61 seconds' where id=$1",[id5]);await user(a);assert.equal(await poll(da),null,'crashed participant expires');
 await db.exec('reset role');await db.exec("update private.calls set created_at=now()-interval '2 days';select private.clean_calls()");assert.equal((await db.query('select count(*) n from private.calls')).rows[0].n,0);
 await db.exec('set role anon');await assert.rejects(db.query('select poll_calls($1)',[dc]));await assert.rejects(act(dc,'start',randomUUID(),r));
 }finally{await db.close();}
});
