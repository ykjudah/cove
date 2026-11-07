const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),C=require('../src/chess-game.cjs');
test('chess backend invitations, random colors, atomic actions, server clocks, draws and permissions',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create schema realtime;create table realtime.messages(topic text,extension text,payload jsonb);alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$select current_setting('request.jwt.claim.topic',true)$$;
  grant usage on schema auth,realtime to authenticated,anon;grant execute on function auth.uid(),realtime.topic() to authenticated,anon;grant select,insert on realtime.messages to authenticated;create publication supabase_realtime;`);
  for(const file of ['setup.sql','upgrade-1.1.sql','upgrade-to-1.2.sql','upgrade-1.3.sql','upgrade-1.3.1.sql','upgrade-1.4.0.sql','upgrade-chess.sql','upgrade-chess.sql'])await db.exec(fs.readFileSync(require.resolve('../supabase/'+file),'utf8'));
 const [a,b,c,e]=Array.from({length:4},()=>randomUUID());
 for(const [id,name]of [[a,'alice'],[b,'bob'],[c,'chris'],[e,'eve']])await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,name+'@users.example.com',JSON.stringify({username:name})]);
 const user=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const rpc=async(sql,args)=>(await db.query(sql,args)).rows[0].p;
 await user(a);const room=(await db.query("select create_group('Chess',array['bob','chris']) id")).rows[0].id;
 let g=await rpc('select create_chess_game($1,$2) p',[room,60]);
 const action=(kind,move=null,end=null,req=randomUUID(),rev=g.revision)=>rpc('select chess_action($1,$2,$3,$4,$5,$6) p',[g.id,kind,rev,req,move,end]);
 const read=()=>rpc('select read_chess_game($1) p',[g.id]);
 assert.equal(g.seconds,60);await assert.rejects(action('accept'));
 await user(e);await assert.rejects(read());assert.equal((await db.query('select * from chess_games')).rows.length,0);await assert.rejects(action('accept'));
 await user(c);g=await action('decline');assert.ok(g.declined.includes(c));await assert.rejects(action('accept'));
 await user(b);g=await action('accept');assert.deepEqual(new Set(Object.values(g.state.players)),new Set([a,b]));assert.equal(g.state.turn,'w');C.engine(g.state);assert.ok(g.state.clocks.activeSince<=g.serverNow);
 await user(c);await assert.rejects(action('accept'));await assert.rejects(action('resign'));assert.equal((await read()).status,'active');
 await user(g.state.players.b);await assert.rejects(action('move',{from:'e2',to:'e4'},C.applyMove(g.state,{from:'e2',to:'e4'},g.state.players.w)));
 await user(g.state.players.w);await assert.rejects(db.query('update chess_games set seconds=0 where id=$1',[g.id]));
 const move={from:'e2',to:'e4'},end=C.applyMove(g.state,move,g.state.players.w);end.clocks.w=999999999;const req=randomUUID(),rev=g.revision;
 g=await action('move',move,end,req,rev);assert.ok(g.state.clocks.w<=60000);assert.equal(g.state.clocks.b,60000);assert.equal(g.state.turn,'b');
 const retry=await action('move',move,end,req,rev);assert.equal(retry.revision,g.revision);
 await assert.rejects(action('move',move,end,randomUUID(),rev));
 await user(g.state.players.w);g=await action('offer');const offerTime=g.state.clocks.activeSince;
 await assert.rejects(action('accept_draw'));
 await user(g.state.players.b);g=await action('decline_draw');assert.equal(g.state.drawOffer,null);assert.equal(g.state.clocks.activeSince,offerTime);
 g=await action('offer');await user(g.state.players.w);g=await action('accept_draw');assert.equal(g.state.result.reason,'agreement');assert.equal(g.status,'finished');
 // Timeout is based on elapsed server time even when nobody had the game open.
 await user(a);g=await rpc('select create_chess_game($1,$2) p',[room,60]);await user(b);g=await action('accept');
 const expired=C.initial(g.state.players,60,0,'7k/8/8/8/8/8/8/KQ6 w - - 0 1');
 await db.exec('reset role');await db.query('update chess_games set state=$1 where id=$2',[expired,g.id]);await user(a);
 g=await read();assert.equal(g.state.result.reason,'timeout vs insufficient material');assert.equal(g.state.result.winner,null);assert.equal(g.state.clocks.w,0);
 // Untimed games survive long absences; resign is final.
 g=await rpc('select create_chess_game($1,$2) p',[room,0]);await user(b);g=await action('accept');assert.equal(g.state.clocks.activeSince,null);assert.equal(g.state.clocks.w,null);
 g=await action('resign');assert.equal(g.state.result.reason,'resignation');assert.equal(g.state.players[g.state.result.winner],a);
 }finally{await db.close();}
});
