const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),P=require('../src/eight-ball.cjs');
test('pool invitations, membership, atomic acceptance, turn checks, idempotent saves',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create schema realtime;create table realtime.messages(topic text,extension text,payload jsonb);alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$select current_setting('request.jwt.claim.topic',true)$$;
  grant usage on schema auth,realtime to authenticated,anon;grant execute on function auth.uid(),realtime.topic() to authenticated,anon;grant select,insert on realtime.messages to authenticated;create publication supabase_realtime;`);
  for(const file of ['setup.sql','upgrade-1.1.sql','upgrade-to-1.2.sql','upgrade-1.3.sql','upgrade-1.3.sql','upgrade-1.3.1.sql','upgrade-1.3.1.sql','upgrade-1.4.0.sql','upgrade-games.sql','upgrade-games.sql','upgrade-1.5.3.sql','upgrade-1.5.3.sql','upgrade-1.5.4.sql','upgrade-1.5.4.sql','upgrade-1.6.1.sql','upgrade-1.6.1.sql'])
   await db.exec(fs.readFileSync(require.resolve('../supabase/'+file),'utf8'));

 const [a,b,c,e]=Array.from({length:4},()=>randomUUID());
 for(const [id,name]of [[a,'alice'],[b,'bob'],[c,'chris'],[e,'eve']])await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,name+'@users.example.com',JSON.stringify({username:name})]);
 const user=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await user(a);const room=(await db.query("select create_group('Pool',array['bob','chris']) id")).rows[0].id;
 const g=(await db.query('select (create_pool_game($1)).*',[room])).rows[0];assert.equal(g.player2,null);assert.equal(g.state,null);
 await assert.rejects(db.query('select accept_pool_game($1)',[g.id]));
 await user(e);assert.equal((await db.query('select * from chat_games')).rows.length,0);await assert.rejects(db.query('select accept_pool_game($1)',[g.id]));
 await user(b);let joined=(await db.query('select (accept_pool_game($1)).*',[g.id])).rows[0];assert.equal(joined.player2,b);assert.equal(joined.state.turn,b);P.validate(joined.state);assert.deepEqual(joined.state,P.initial([b,a]));
 await user(c);await assert.rejects(db.query('select accept_pool_game($1)',[g.id]),/already accepted/);
 const topic='tungchat-pool:'+g.id+':'+b;
 assert.equal((await db.query('select can_access_pool_live($1,false) ok',[topic])).rows[0].ok,true);
 assert.equal((await db.query('select can_access_pool_live($1,true) ok',[topic])).rows[0].ok,false);
 await user(e);assert.equal((await db.query('select can_access_pool_live($1,false) ok',[topic])).rows[0].ok,false);
 await user(b);assert.equal((await db.query('select can_access_pool_live($1,true) ok',[topic])).rows[0].ok,true);
 await user(c);
 const shot={angle:0,power:.8},end=P.simulate(joined.state,shot,b),args=[g.id,0,shot,end];
 await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',args));
 await user(a);await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',args));
 await user(b);await assert.rejects(db.query('update chat_games set revision=90 where id=$1',[g.id]));
 await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',[g.id,0,shot,{...end,turn:null}]));
 await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',[g.id,0,shot,{...end,version:1}]));
 await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',[g.id,0,{...shot,magnets:true},end]),/Owner magnets/);
 await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',[g.id,0,{...shot,calledPocket:0},end]),/Cannot call/);
 const saved=(await db.query('select (submit_pool_shot($1,$2,$3,$4)).*',args)).rows[0];assert.equal(saved.revision,1);assert.deepEqual(saved.state,end);
 const retry=(await db.query('select (submit_pool_shot($1,$2,$3,$4)).*',args)).rows[0];assert.equal(retry.revision,1);
 await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',[g.id,0,{angle:1,power:.8},end]));
 // A saved legacy match still accepts shots with its original geometry.
 await user(a);const old=(await db.query('select (create_pool_game($1)).*',[room])).rows[0];
 await user(b);await db.query('select accept_pool_game($1)',[old.id]);
 const legacy=P.initial([b,a],1);await db.exec('reset role');await db.query('update chat_games set state=$1 where id=$2',[legacy,old.id]);
 await user(b);const legacyEnd=P.simulate(legacy,shot,b);
 const legacySaved=(await db.query('select (submit_pool_shot($1,$2,$3,$4)).*',[old.id,0,shot,legacyEnd])).rows[0];
 assert.deepEqual(legacySaved.state,legacyEnd);
 // Owner permission is checked by the server, not just the UI.
 await db.exec('reset role');await db.query('insert into private.app_owner(user_id) values($1)',[b]);
 await user(a);const mg=(await db.query('select (create_pool_game($1)).*',[room])).rows[0];
 await user(b);const mj=(await db.query('select (accept_pool_game($1)).*',[mg.id])).rows[0];
 await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',[mg.id,0,{...shot,magnets:true},end]),/adjustable magnets/);
 await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',[mg.id,0,{...shot,magnets:true,magnetStrength:2},end]),/Invalid magnet strength/);
 const ms={...shot,magnets:true,magnetStrength:.75,magnetBoost:2},me=P.simulate(mj.state,ms,b);await db.query('select submit_pool_shot($1,$2,$3,$4)',[mg.id,0,ms,me]);
 // The final-eight call is mandatory and validated.
 const eight=P.initial([b,a]);eight.groups=['solids','stripes'];eight.break=false;for(const ball of eight.balls)if(P.group(ball.n)==='solids')ball.pocketed=true;
 await db.exec('reset role');await db.query('update chat_games set state=$1,revision=0,shot=null where id=$2',[eight,mg.id]);await user(b);
 const called={...shot,calledPocket:2},ee=P.simulate(eight,called,b);
 await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',[mg.id,0,shot,ee]),/Choose/);
 await assert.rejects(db.query('select submit_pool_shot($1,$2,$3,$4)',[mg.id,0,{...shot,calledPocket:1.5},ee]),/Choose/);
 await db.query('select submit_pool_shot($1,$2,$3,$4)',[mg.id,0,called,ee]);
 await user(e);await assert.rejects(db.query('select create_pool_game($1)',[room]));
 }finally{await db.close();}
});
