-- TungChat games: run after existing 1.4.0 migrations. No Storage changes.
begin;
create table if not exists public.chat_games (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id) on delete cascade,
 player1 uuid not null references public.profiles(id) on delete cascade,
 player2 uuid references public.profiles(id) on delete cascade,
 state jsonb, shot jsonb, revision integer not null default 0,
 updated_at timestamptz not null default now(), check(player1<>player2)
);
alter table public.chat_games enable row level security;
revoke all on public.chat_games from public,anon,authenticated;
grant select on public.chat_games to authenticated;
drop policy if exists games_read on public.chat_games;
create policy games_read on public.chat_games for select to authenticated using(private.is_member(room_id));
create or replace function private.pool_initial(a uuid,b uuid) returns jsonb
language plpgsql immutable set search_path='' as $$
declare balls jsonb:='[{"n":0,"x":-106,"y":0,"vx":0,"vy":0,"pocketed":false}]'; nums integer[]:=array[1,9,2,10,8,3,4,11,5,12,6,7,13,14,15]; k integer:=1; r integer; c integer;
begin
 for r in 0..4 loop for c in 0..r loop
 balls:=balls||jsonb_build_array(jsonb_build_object('n',nums[k],'x',82+r*9.3,'y',(c-r/2.0)*10.7,'vx',0,'vy',0,'pocketed',false));k:=k+1;
 end loop;end loop;
 return jsonb_build_object('version',3,'players',jsonb_build_array(a,b),'turn',a,'groups','[null,null]'::jsonb,'ballInHand',false,'break',true,'winner',null,'shotNumber',0,'balls',balls,'result','Player 1 breaks');
end $$;
revoke all on function private.pool_initial(uuid,uuid) from public,anon,authenticated;
create or replace function public.create_pool_game(target_room uuid) returns public.chat_games
language plpgsql security definer set search_path='' as $$
declare g public.chat_games; actor uuid:=auth.uid();
begin
 if actor is null or not private.is_member(target_room) then raise exception 'Game unavailable';end if;
 insert into public.chat_games(room_id,player1) values(target_room,actor) returning * into g;
 insert into public.messages(room_id,sender_id,body) values(target_room,actor,'[[tungchat-pool:v1]]'||g.id::text);
 return g;
end $$;
create or replace function public.accept_pool_game(game_id uuid) returns public.chat_games
language plpgsql security definer set search_path='' as $$
declare g public.chat_games; actor uuid:=auth.uid();
begin
 select * into g from public.chat_games where id=game_id for update;
 if not found or actor is null or actor=g.player1 or not private.is_member(g.room_id) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player1) or private.people_blocked(actor,g.player1) then raise exception 'Game unavailable';end if;
 if g.player2 is not null then
  if g.player2=actor then return g;end if;
  raise exception 'Someone already accepted this game';
 end if;
 update public.chat_games set player2=actor,state=private.pool_initial(actor,g.player1),updated_at=now() where id=g.id returning * into g;
 return g;
end $$;
create or replace function public.submit_pool_shot(game_id uuid,expected_revision integer,shot_data jsonb,end_state jsonb) returns public.chat_games
language plpgsql security definer set search_path='' as $$
declare g public.chat_games; actor uuid:=auth.uid(); b jsonb;
begin
 select * into g from public.chat_games where id=game_id for update;
 if not found or g.player2 is null or actor is null or actor not in(g.player1,g.player2) or not private.is_member(g.room_id) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player1) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player2) or private.people_blocked(g.player1,g.player2) then raise exception 'Game unavailable';end if;
 -- Idempotent retry after a successful save whose response was lost.
 if g.revision=expected_revision+1 and g.shot=shot_data and g.state=end_state then return g;end if;
 if g.revision<>expected_revision or g.state->>'turn'<>actor::text or g.state->'winner'<>'null'::jsonb then raise exception 'Turn changed. Reopen the game.';end if;
 if jsonb_typeof(shot_data) is distinct from 'object' or jsonb_typeof(end_state) is distinct from 'object' or octet_length(shot_data::text)>500 or octet_length(end_state::text)>16000 then raise exception 'Invalid shot';end if;
 if not(shot_data ?& array['angle','power']) or jsonb_typeof(shot_data->'angle') is distinct from 'number' or jsonb_typeof(shot_data->'power') is distinct from 'number' or (shot_data->>'power')::numeric not between 0.1 and 1 or abs((shot_data->>'angle')::numeric)>6.284 then raise exception 'Invalid shot';end if;
 if shot_data ? 'magnets' and (jsonb_typeof(shot_data->'magnets') is distinct from 'boolean' or ((shot_data->>'magnets')::boolean and (not public.is_app_owner() or g.state->>'version'<>'3'))) then raise exception 'Owner magnets unavailable';end if;
 if shot_data ? 'magnetBoost' and (jsonb_typeof(shot_data->'magnetBoost') is distinct from 'number' or shot_data->>'magnetBoost'<>'2') then raise exception 'Invalid magnet boost';end if;
 if shot_data ? 'magnetStrength' and (jsonb_typeof(shot_data->'magnetStrength') is distinct from 'number' or (shot_data->>'magnetStrength')::numeric not between 0 and 1 or g.state->>'version'<>'3') then raise exception 'Invalid magnet strength';end if;
 if shot_data->>'magnets'='true' and (not(shot_data ? 'magnetStrength') or shot_data->>'magnetBoost' is distinct from '2') then raise exception 'Update TungChat to use adjustable magnets';end if;
 if g.state->>'version'='3' and g.state->'groups'->>(case when g.state->'players'->>0=actor::text then 0 else 1 end) is not null
 and not exists(select 1 from jsonb_array_elements(g.state->'balls') ball where not (ball->>'pocketed')::boolean and (case when (ball->>'n')::integer between 1 and 7 then 'solids' when (ball->>'n')::integer between 9 and 15 then 'stripes' end)=g.state->'groups'->>(case when g.state->'players'->>0=actor::text then 0 else 1 end))
 then
  if jsonb_typeof(shot_data->'calledPocket') is distinct from 'number' or (shot_data->>'calledPocket')::numeric not between 0 and 5 or (shot_data->>'calledPocket')::numeric<>trunc((shot_data->>'calledPocket')::numeric) then raise exception 'Choose an 8-ball pocket';end if;
 elsif shot_data ? 'calledPocket' then raise exception 'Cannot call a pocket yet';end if;
 if shot_data ? 'cue' and (jsonb_typeof(shot_data->'cue'->'x') is distinct from 'number' or jsonb_typeof(shot_data->'cue'->'y') is distinct from 'number' or abs((shot_data->'cue'->>'x')::numeric)>(case when g.state->>'version' in ('2','3') then 194.75 else 163 end) or abs((shot_data->'cue'->>'y')::numeric)>(case when g.state->>'version' in ('2','3') then 94.75 else 93 end)) then raise exception 'Invalid placement';end if;
 if (g.state->>'ballInHand')::boolean<>(shot_data ? 'cue') then raise exception 'Invalid cue placement';end if;
 if not(end_state ?& array['version','players','turn','groups','ballInHand','break','winner','shotNumber','balls']) or jsonb_typeof(end_state->'turn') is distinct from 'string' or jsonb_typeof(end_state->'version') is distinct from 'number' or jsonb_typeof(end_state->'shotNumber') is distinct from 'number' or jsonb_typeof(end_state->'break') is distinct from 'boolean' or jsonb_typeof(end_state->'ballInHand') is distinct from 'boolean' or end_state->'players'<>g.state->'players' or end_state->>'version' not in ('1','2','3') or end_state->'version'<>g.state->'version' or (end_state->>'shotNumber')::integer<>g.revision+1 or end_state->>'turn' not in(g.player1::text,g.player2::text) or end_state->'groups' not in ('[null,null]'::jsonb,'["solids","stripes"]'::jsonb,'["stripes","solids"]'::jsonb) or jsonb_typeof(end_state->'ballInHand')<>'boolean' or end_state->>'break'<>'false' or (end_state->'winner'<>'null'::jsonb and end_state->>'winner' not in(g.player1::text,g.player2::text)) then raise exception 'Invalid game state';end if;
 if jsonb_typeof(end_state->'balls') is distinct from 'array' or jsonb_array_length(end_state->'balls')<>16 or (select count(distinct value->>'n') from jsonb_array_elements(end_state->'balls'))<>16 then raise exception 'Invalid balls';end if;
 for b in select value from jsonb_array_elements(end_state->'balls') loop
  if not(b ?& array['n','x','y','vx','vy','pocketed']) or exists(select 1 from unnest(array['n','x','y','vx','vy']) key where jsonb_typeof(b->key) is distinct from 'number') or (b->>'n')::integer not between 0 and 15 or abs((b->>'x')::numeric)>(case when g.state->>'version' in ('2','3') then 230 else 200 end) or abs((b->>'y')::numeric)>130 or (b->>'vx')::numeric<>0 or (b->>'vy')::numeric<>0 or jsonb_typeof(b->'pocketed')<>'boolean' then raise exception 'Invalid ball';end if;
 end loop;
 update public.chat_games set state=end_state,shot=shot_data,revision=revision+1,updated_at=now() where id=g.id returning * into g;
 return g;
end $$;
revoke all on function public.create_pool_game(uuid),public.accept_pool_game(uuid),public.submit_pool_shot(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.create_pool_game(uuid),public.accept_pool_game(uuid),public.submit_pool_shot(uuid,integer,jsonb,jsonb) to authenticated;
do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_games') then alter publication supabase_realtime add table public.chat_games;end if;
end $$;

-- Each player has a separate private topic. A player cannot impersonate the other.
create or replace function public.can_access_pool_live(topic text,sending boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare game_uuid uuid; actor uuid; g public.chat_games;
begin
 if topic !~ '^tungchat-pool:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
 game_uuid:=split_part(topic,':',2)::uuid;actor:=split_part(topic,':',3)::uuid;
 select * into g from public.chat_games where id=game_uuid;
 return coalesce(auth.uid() is not null and private.is_member(g.room_id) and g.player2 is not null
 and actor in(g.player1,g.player2) and (not sending or auth.uid()=actor)
 and not private.people_blocked(g.player1,g.player2),false);
end $$;
revoke all on function public.can_access_pool_live(text,boolean) from public,anon;
grant execute on function public.can_access_pool_live(text,boolean) to authenticated;
drop policy if exists tungchat_pool_live_read on realtime.messages;
drop policy if exists tungchat_pool_live_send on realtime.messages;
create policy tungchat_pool_live_read on realtime.messages for select to authenticated using(extension='broadcast' and public.can_access_pool_live((select realtime.topic()),false));
create policy tungchat_pool_live_send on realtime.messages for insert to authenticated with check(extension='broadcast' and public.can_access_pool_live((select realtime.topic()),true));

commit;

-- TungChat chess. Run after the existing TungChat messaging migrations.
begin;
create table if not exists public.chess_games(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id) on delete cascade,
 player1 uuid not null references public.profiles(id) on delete cascade,
 player2 uuid references public.profiles(id) on delete cascade,
 seconds integer not null check(seconds in(0,60,300,600,1800)),
 status text not null default 'pending' check(status in('pending','active','finished','cancelled')),
 declined uuid[] not null default '{}', state jsonb, revision integer not null default 0,
 last_request uuid,last_actor uuid,updated_at timestamptz not null default now(),check(player1<>player2)
);
alter table public.chess_games enable row level security;
revoke all on public.chess_games from public,anon,authenticated;
grant select on public.chess_games to authenticated;
drop policy if exists chess_read on public.chess_games;
create policy chess_read on public.chess_games for select to authenticated using(private.is_member(room_id));
create or replace function private.chess_position(fen text) returns jsonb language plpgsql immutable set search_path='' as $$
declare ranks text[]:=string_to_array(split_part(fen,' ',1),'/');r integer;c integer;ch text;i integer;out jsonb:='{}';
begin
 if array_length(ranks,1)<>8 then raise exception 'Invalid chess board';end if;
 for r in 1..8 loop c:=0;for i in 1..length(ranks[r]) loop ch:=substr(ranks[r],i,1);
 if ch~'^[1-8]$' then c:=c+ch::integer;elsif ch~'^[prnbqkPRNBQK]$' then
 out:=out||jsonb_build_object(chr(97+c)||(9-r)::text,jsonb_build_object('type',lower(ch),'color',case when ch=upper(ch) then 'w' else 'b' end));c:=c+1;
 else raise exception 'Invalid piece';end if;end loop;if c<>8 then raise exception 'Invalid chess rank';end if;end loop;return out;
end $$;
create or replace function private.chess_initial(w uuid,b uuid,seconds integer,stamp numeric) returns jsonb language plpgsql immutable set search_path='' as $$
declare fen text:='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
begin return jsonb_build_object('version',1,'players',jsonb_build_object('w',w,'b',b),'initialFen',fen,'fen',fen,'position',private.chess_position(fen),'turn','w','castling','KQkq','enPassant','-','halfmove',0,'fullmove',1,'moves','[]'::jsonb,'history',jsonb_build_array(fen),'clocks',jsonb_build_object('w',case when seconds>0 then seconds*1000 end,'b',case when seconds>0 then seconds*1000 end,'activeSince',case when seconds>0 then stamp end),'result',null,'drawOffer',null);end $$;
create or replace function private.chess_mating(s jsonb,color text) returns boolean language plpgsql immutable set search_path='' as $$
declare p record;n integer:=0;b0 boolean:=false;b1 boolean:=false;
begin
 for p in select * from jsonb_each(s->'position') loop if p.value->>'color'<>color then continue;end if;
 if p.value->>'type' in('p','q','r') then return true;end if;
 if p.value->>'type'='n' then n:=n+1;end if;
 if p.value->>'type'='b' then if (ascii(substr(p.key,1,1))+substr(p.key,2,1)::integer)%2=0 then b0:=true;else b1:=true;end if;end if;
 end loop;return n>=2 or (n>0 and (b0 or b1)) or (b0 and b1);
end $$;
create or replace function private.chess_expire(g public.chess_games) returns public.chess_games language plpgsql set search_path='' as $$
declare stamp numeric:=extract(epoch from clock_timestamp())*1000;t text:=g.state->>'turn';opponent text:=case when t='w' then 'b' else 'w' end;left_ms numeric;
begin
 if g.status<>'active' or g.seconds=0 then return g;end if;
 left_ms:=(g.state->'clocks'->>t)::numeric-(stamp-(g.state->'clocks'->>'activeSince')::numeric);
 if left_ms<=0 then
 g.state:=jsonb_set(g.state,array['clocks',t],'0');
 g.state:=jsonb_set(g.state,'{result}',case when private.chess_mating(g.state,opponent) then jsonb_build_object('winner',opponent,'reason','timeout') else jsonb_build_object('winner',null,'reason','timeout vs insufficient material') end);
 g.state:=jsonb_set(g.state,'{clocks,activeSince}','null');g.state:=jsonb_set(g.state,'{drawOffer}','null');
 update public.chess_games set state=g.state,status='finished',revision=revision+1,updated_at=clock_timestamp() where id=g.id returning * into g;
 end if;return g;
end $$;
create or replace function private.chess_packet(g public.chess_games) returns jsonb language sql volatile set search_path='' as $$
 select to_jsonb(g)||jsonb_build_object('serverNow',extract(epoch from clock_timestamp())*1000)
$$;
create or replace function public.create_chess_game(target_room uuid,time_control integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.chess_games;a uuid:=auth.uid();
begin
 if a is null or not private.is_member(target_room) or time_control not in(0,60,300,600,1800) or time_control is null then raise exception 'Chess invitation unavailable';end if;
 insert into public.chess_games(room_id,player1,seconds) values(target_room,a,time_control) returning * into g;
 insert into public.messages(room_id,sender_id,body) values(target_room,a,'[[tungchat-chess:v1]]'||g.id::text||':'||time_control::text);
 return private.chess_packet(g);
end $$;
create or replace function public.read_chess_game(game_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.chess_games;
begin select * into g from public.chess_games where id=game_id for update;
 if not found or auth.uid() is null or not private.is_member(g.room_id) then raise exception 'Chess game unavailable';end if;
 g:=private.chess_expire(g);return private.chess_packet(g);end $$;
create or replace function public.chess_action(game_id uuid,action text,expected_revision integer,request_id uuid,move_data jsonb default null,end_state jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.chess_games;a uuid:=auth.uid();stamp numeric;t text;opp text;next_state jsonb;count_moves integer;left_ms numeric;parts text[];last_move jsonb;w uuid;b uuid;
begin
 select * into g from public.chess_games where id=game_id for update;
 if not found or a is null or not private.is_member(g.room_id) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player1) then raise exception 'Chess game unavailable';end if;
 if request_id is null then raise exception 'Request ID required';end if;
 if g.last_request=request_id and g.last_actor=a then return private.chess_packet(g);end if;
 g:=private.chess_expire(g);
 if action='refresh' or g.status='finished' then return private.chess_packet(g);end if;
 if g.revision<>expected_revision then raise exception 'Game changed. Reopen or try again.';end if;
 stamp:=extract(epoch from clock_timestamp())*1000;
 if g.status='active' and g.seconds>0 and stamp>=(g.state->'clocks'->>'activeSince')::numeric+(g.state->'clocks'->>(g.state->>'turn'))::numeric then g:=private.chess_expire(g);return private.chess_packet(g);end if;
 if g.status='pending' then
  if action='cancel' and a=g.player1 then g.status:='cancelled';
  elsif a=g.player1 or private.people_blocked(a,g.player1) then raise exception 'Cannot accept your own game';
  elsif action='decline' then if not a=any(g.declined) then g.declined:=array_append(g.declined,a);end if;
  elsif action='accept' and not a=any(g.declined) then
   g.player2:=a;if random()<0.5 then w:=g.player1;b:=a;else w:=a;b:=g.player1;end if;
   g.state:=private.chess_initial(w,b,g.seconds,stamp);g.status:='active';
  else raise exception 'Invitation unavailable';end if;
 elsif g.status='active' then
  if a not in(g.player1,g.player2) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player2) or private.people_blocked(g.player1,g.player2) then raise exception 'Only current players may act';end if;
  t:=g.state->>'turn';opp:=case when t='w' then 'b' else 'w' end;
  if action='move' then
   if g.state->'players'->>t<>a::text then raise exception 'It is not your turn';end if;
   if jsonb_typeof(move_data) is distinct from 'object' or jsonb_typeof(end_state) is distinct from 'object' or octet_length(end_state::text)>4000000 then raise exception 'Invalid move';end if;
   if not(move_data ?& array['from','to']) or move_data->>'from' !~ '^[a-h][1-8]$' or move_data->>'to' !~ '^[a-h][1-8]$' or (move_data ? 'promotion' and coalesce(move_data->>'promotion','') not in('q','r','b','n')) then raise exception 'Invalid move squares';end if;
   count_moves:=jsonb_array_length(g.state->'moves');last_move:=end_state->'moves'->count_moves;
   if end_state->'version' is distinct from g.state->'version' or end_state->'players' is distinct from g.state->'players' or end_state->'initialFen' is distinct from g.state->'initialFen' or end_state->>'turn' is distinct from opp
    or jsonb_array_length(end_state->'moves')<>count_moves+1 or ((end_state->'moves')-count_moves) is distinct from g.state->'moves'
    or jsonb_array_length(end_state->'history')<>count_moves+2 or ((end_state->'history')-(count_moves+1)) is distinct from g.state->'history'
    or last_move->>'from' is distinct from move_data->>'from' or last_move->>'to' is distinct from move_data->>'to' or last_move->>'promotion' is distinct from move_data->>'promotion'
    or g.state->'position'->(move_data->>'from')->>'color' is distinct from t
    or end_state->'history'->>(count_moves+1) is distinct from end_state->>'fen' then raise exception 'Invalid chess state';end if;
   parts:=string_to_array(end_state->>'fen',' ');
   if array_length(parts,1)<>6 or parts[2]<>opp or end_state->'position' is distinct from private.chess_position(end_state->>'fen')
    or end_state->>'castling' is distinct from parts[3] or end_state->>'enPassant' is distinct from parts[4]
    or end_state->>'halfmove' is distinct from parts[5] or end_state->>'fullmove' is distinct from parts[6] then raise exception 'Invalid position';end if;
   if not(end_state ? 'result') or (end_state->'result'<>'null'::jsonb and (jsonb_typeof(end_state->'result')<>'object' or not(end_state->'result' ?& array['winner','reason']) or end_state->'result'->>'reason' not in('checkmate','stalemate','insufficient material','threefold repetition','fifty-move rule') or (end_state->'result'->'winner'<>'null'::jsonb and end_state->'result'->>'winner' not in('w','b')))) then raise exception 'Invalid result';end if;
   next_state:=end_state;next_state:=jsonb_set(next_state,'{clocks}',g.state->'clocks');
   if g.seconds>0 then left_ms:=greatest(0,(g.state->'clocks'->>t)::numeric-(stamp-(g.state->'clocks'->>'activeSince')::numeric));next_state:=jsonb_set(next_state,array['clocks',t],to_jsonb(left_ms));next_state:=jsonb_set(next_state,'{clocks,activeSince}',to_jsonb(stamp));end if;
   next_state:=jsonb_set(next_state,'{drawOffer}',case when g.state->>'drawOffer'=a::text then g.state->'drawOffer' else 'null'::jsonb end);
   g.state:=next_state;
  elsif action='resign' then g.state:=jsonb_set(g.state,'{result}',jsonb_build_object('winner',case when g.state->'players'->>'w'=a::text then 'b' else 'w' end,'reason','resignation'));
  elsif action='offer' then if g.state->'drawOffer'<>'null'::jsonb then raise exception 'A draw is already offered';end if;g.state:=jsonb_set(g.state,'{drawOffer}',to_jsonb(a::text));
  elsif action in('accept_draw','decline_draw') then
   if g.state->'drawOffer'='null'::jsonb or g.state->>'drawOffer'=a::text then raise exception 'No opponent draw offer';end if;
   if action='accept_draw' then g.state:=jsonb_set(g.state,'{result}',jsonb_build_object('winner',null,'reason','agreement'));end if;
   g.state:=jsonb_set(g.state,'{drawOffer}','null');
  else raise exception 'Invalid chess action';end if;
  if g.state->'result'<>'null'::jsonb then
   if g.seconds>0 and action<>'move' then g.state:=jsonb_set(g.state,array['clocks',t],to_jsonb(greatest(0,(g.state->'clocks'->>t)::numeric-(stamp-(g.state->'clocks'->>'activeSince')::numeric))));end if;
   g.state:=jsonb_set(g.state,'{clocks,activeSince}','null');g.state:=jsonb_set(g.state,'{drawOffer}','null');g.status:='finished';
  end if;
 else raise exception 'Game unavailable';end if;
 update public.chess_games set player2=g.player2,status=g.status,declined=g.declined,state=g.state,revision=revision+1,last_request=request_id,last_actor=a,updated_at=clock_timestamp() where id=g.id returning * into g;
 return private.chess_packet(g);
end $$;
revoke all on function private.chess_position(text),private.chess_initial(uuid,uuid,integer,numeric),private.chess_mating(jsonb,text),private.chess_expire(public.chess_games),private.chess_packet(public.chess_games) from public,anon,authenticated;
revoke all on function public.create_chess_game(uuid,integer),public.read_chess_game(uuid),public.chess_action(uuid,text,integer,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_chess_game(uuid,integer),public.read_chess_game(uuid),public.chess_action(uuid,text,integer,uuid,jsonb,jsonb) to authenticated;
commit;

begin;
create table if not exists public.golf_games(
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.rooms(id) on delete cascade,
 player1 uuid not null references public.profiles(id) on delete cascade,player2 uuid references public.profiles(id) on delete cascade,
 state jsonb,shot jsonb,revision integer not null default 0,updated_at timestamptz not null default now(),check(player1<>player2)
);
alter table public.golf_games add column if not exists hole_count integer not null default 9 check(hole_count in(3,5,9));
create index if not exists golf_room_updated on public.golf_games(room_id,updated_at desc);
alter table public.golf_games enable row level security;
revoke all on public.golf_games from public,anon,authenticated;
grant select on public.golf_games to authenticated;
drop policy if exists golf_read on public.golf_games;
create policy golf_read on public.golf_games for select to authenticated using(private.is_member(room_id));
drop function if exists public.create_golf_game(uuid);
create or replace function public.create_golf_game(target_room uuid,holes integer default 3) returns public.golf_games language plpgsql security definer set search_path='' as $$
declare g public.golf_games;
begin
 if auth.uid() is null or not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
 if holes not in(3,5) or holes is null then raise exception 'Choose 3 or 5 holes';end if;
 insert into public.golf_games(room_id,player1,hole_count) values(target_room,auth.uid(),holes) returning * into g;
 insert into public.messages(room_id,sender_id,body) values(target_room,auth.uid(),'[[sahur-golf:v1]]'||g.id::text);return g;
end $$;
create or replace function public.accept_golf_game(game_id uuid) returns public.golf_games language plpgsql security definer set search_path='' as $$
declare g public.golf_games;seed bigint;course_order jsonb;tee jsonb;tees jsonb:='[[150,395],[95,500],[90,495],[200,565],[100,545],[95,620],[90,675],[90,585],[85,760],[100,720],[100,665],[230,700],[110,690],[220,700],[230,700],[95,740],[95,690],[105,680],[95,750],[95,715],[95,675],[230,685],[95,750],[90,695],[95,575],[230,725],[90,705],[90,735],[95,755]]';
begin
 select * into g from public.golf_games where id=game_id for update;
 if not found or auth.uid() is null or auth.uid()=g.player1 or not private.is_member(g.room_id) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player1) or private.people_blocked(auth.uid(),g.player1) then raise exception 'Game unavailable';end if;
 if g.player2 is not null then if g.player2=auth.uid() then return g;end if;raise exception 'Someone already accepted';end if;
 select jsonb_agg(n) into course_order from (select n from generate_series(1,28) n order by random() limit g.hole_count) choices;tee:=tees->(course_order->>0)::integer;
 seed:=('x'||substr(replace(g.id::text,'-',''),1,8))::bit(32)::bigint;
 update public.golf_games set player2=auth.uid(),state=jsonb_build_object('version',1,'courseSet',case when g.hole_count=9 then 1 else 3 end,'players',jsonb_build_array(auth.uid(),g.player1),'turn',auth.uid(),'hole',0,'obstacleTick',0,'seed',seed,'balls','[{"x":141,"y":395,"sunk":false},{"x":159,"y":395,"sunk":false}]'::jsonb,'scores','[[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]]'::jsonb,'shotNumber',0,'finished',false,'winner',null,'lastHole',null)||case when g.hole_count=9 then '{}'::jsonb else jsonb_build_object('holeCount',g.hole_count,'courseOrder',course_order,'balls',jsonb_build_array(jsonb_build_object('x',(tee->>0)::integer-9,'y',(tee->>1)::integer,'sunk',false),jsonb_build_object('x',(tee->>0)::integer+9,'y',(tee->>1)::integer,'sunk',false))) end,updated_at=now() where id=g.id returning * into g;return g;
end $$;
create or replace function public.submit_golf_shot(game_id uuid,expected_revision integer,shot_data jsonb,end_state jsonb) returns public.golf_games language plpgsql security definer set search_path='' as $$
declare g public.golf_games;s jsonb;h integer;nh integer;i integer;j integer;p integer;k integer;total0 integer:=0;total1 integer:=0;b jsonb;expected_turn text;expected_winner text;starts jsonb:='[[150,395],[95,500],[90,495],[200,565],[100,545],[95,620],[90,675],[90,585],[85,760],[100,720],[100,665],[230,700],[110,690],[220,700],[230,700],[95,740],[95,690],[105,680],[95,750],[95,715],[95,675],[230,685],[95,750],[90,695],[95,575],[230,725],[90,705],[90,735],[95,755]]';
begin
 select * into g from public.golf_games where id=game_id for update;
 if not found or auth.uid() is null or g.player2 is null or auth.uid() not in(g.player1,g.player2) or not private.is_member(g.room_id) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player1) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player2) or private.people_blocked(g.player1,g.player2) then raise exception 'Game unavailable';end if;
 if g.revision=expected_revision+1 and g.shot=shot_data and g.state=end_state then return g;end if;
 s:=g.state;if s->>'courseSet'='2' then starts:='[[95,500],[100,545],[90,675],[90,585],[85,760]]'::jsonb;end if;if g.revision<>expected_revision or s->>'turn'<>auth.uid()::text or s->>'finished'<>'false' then raise exception 'Turn changed. Reopen the game';end if;
 if jsonb_typeof(shot_data) is distinct from 'object' or jsonb_typeof(end_state) is distinct from 'object' or octet_length(end_state::text)>8000 or octet_length(shot_data::text)>200 or (select count(*) from jsonb_object_keys(shot_data))<>2 or jsonb_typeof(shot_data->'angle') is distinct from 'number' or jsonb_typeof(shot_data->'power') is distinct from 'number' or abs((shot_data->>'angle')::numeric)>6.284 or (shot_data->>'power')::numeric not between .08 and 1 then raise exception 'Invalid shot';end if;
 if not(end_state ?& array['version','courseSet','players','turn','hole','obstacleTick','seed','balls','scores','shotNumber','finished','winner','lastHole']) or end_state->'version' is distinct from '1'::jsonb or end_state->'courseSet' is distinct from s->'courseSet' or end_state->'holeCount' is distinct from s->'holeCount' or end_state->'courseOrder' is distinct from s->'courseOrder' or end_state->'players' is distinct from s->'players' or end_state->>'turn' not in(g.player1::text,g.player2::text) or jsonb_typeof(end_state->'finished') is distinct from 'boolean' or jsonb_typeof(end_state->'balls') is distinct from 'array' or jsonb_array_length(end_state->'balls')<>2 or jsonb_typeof(end_state->'scores') is distinct from 'array' or jsonb_array_length(end_state->'scores')<>2 then raise exception 'Invalid game state';end if;
 foreach b in array array[end_state->'hole',end_state->'obstacleTick',end_state->'seed',end_state->'shotNumber'] loop if jsonb_typeof(b) is distinct from 'number' or b::text::numeric<>trunc(b::text::numeric) then raise exception 'Invalid game clock';end if;end loop;
 h:=(s->>'hole')::integer;nh:=(end_state->>'hole')::integer;i:=case when s->'players'->>0=auth.uid()::text then 0 else 1 end;j:=1-i;
 if nh not between h and least(h+1,g.hole_count-1) or (end_state->>'shotNumber')::integer<>g.revision+1 or (end_state->>'obstacleTick')::bigint not between (s->>'obstacleTick')::bigint+1 and (s->>'obstacleTick')::bigint+1200 or (end_state->>'seed')::numeric not between 0 and 4294967295 then raise exception 'Invalid progression';end if;
 for p in 0..1 loop
 if jsonb_typeof(end_state->'scores'->p) is distinct from 'array' or jsonb_array_length(end_state->'scores'->p)<>9 then raise exception 'Invalid scores';end if;
 for k in 0..8 loop
 if jsonb_typeof(end_state->'scores'->p->k) is distinct from 'number' or (end_state->'scores'->p->>k)::numeric<>((s->'scores'->p->>k)::numeric+case when p=i and k=h then 1 else 0 end) or (end_state->'scores'->p->>k)::numeric not between 0 and 10 then raise exception 'Invalid score';end if;
 end loop;
 b:=end_state->'balls'->p;
 if jsonb_typeof(b->'x') is distinct from 'number' or jsonb_typeof(b->'y') is distinct from 'number' or jsonb_typeof(b->'sunk') is distinct from 'boolean' or (b->>'x')::numeric not between 0 and 460 or (b->>'y')::numeric not between 0 and 850 then raise exception 'Invalid ball';end if;
 end loop;
 if nh=h then
 if end_state->'balls'->j is distinct from s->'balls'->j then raise exception 'Opponent ball changed';end if;
 if (end_state->'scores'->i->>h)::integer=10 and end_state->'balls'->i->>'sunk'<>'true' then raise exception 'Stroke limit reached';end if;
 if end_state->>'finished'='true' then
  if h<>g.hole_count-1 or end_state->'balls'->0->>'sunk'<>'true' or end_state->'balls'->1->>'sunk'<>'true' or end_state->'lastHole' is distinct from to_jsonb(h) then raise exception 'Game not finished';end if;
  for k in 0..8 loop total0:=total0+(end_state->'scores'->0->>k)::integer;total1:=total1+(end_state->'scores'->1->>k)::integer;end loop;
  expected_winner:=case when total0=total1 then null when total0<total1 then s->'players'->>0 else s->'players'->>1 end;
  if end_state->>'winner' is distinct from expected_winner or end_state->>'turn' is distinct from auth.uid()::text then raise exception 'Invalid result';end if;
 else
  if end_state->'balls'->0->>'sunk'='true' and end_state->'balls'->1->>'sunk'='true' then raise exception 'Advance to the next hole';end if;
  expected_turn:=s->'players'->>(case when end_state->'balls'->i->>'sunk'='true' then j else i end);
  if end_state->>'turn' is distinct from expected_turn or end_state->'winner' is distinct from 'null'::jsonb or end_state->'lastHole' is distinct from 'null'::jsonb then raise exception 'Invalid turn';end if;
 end if;
 else
  if s->'balls'->j->>'sunk'<>'true' or end_state->>'finished'<>'false' or end_state->'winner' is distinct from 'null'::jsonb or end_state->'lastHole' is distinct from to_jsonb(h) or end_state->>'turn' is distinct from s->'players'->>(nh%2) then raise exception 'Hole not finished';end if;
  if s->>'courseSet'='3' then starts:=jsonb_set(starts,array[nh::text],starts->(s->'courseOrder'->>nh)::integer);end if;
  for p in 0..1 loop b:=end_state->'balls'->p;if b->>'sunk'<>'false' or (b->>'x')::numeric<>((starts->nh->>0)::numeric+case when p=0 then -9 else 9 end) or (b->>'y')::numeric<>(starts->nh->>1)::numeric then raise exception 'Invalid next tee';end if;end loop;
 end if;
 update public.golf_games set state=end_state,shot=shot_data,revision=revision+1,updated_at=now() where id=g.id returning * into g;return g;
end $$;
revoke all on function public.create_golf_game(uuid,integer),public.accept_golf_game(uuid),public.submit_golf_shot(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.create_golf_game(uuid,integer),public.accept_golf_game(uuid),public.submit_golf_shot(uuid,integer,jsonb,jsonb) to authenticated;
create or replace function public.can_access_golf_live(topic text,sending boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare game_uuid uuid; actor uuid; g public.golf_games;
begin
 if topic !~ '^sahur-golf:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
 game_uuid:=split_part(topic,':',2)::uuid;actor:=split_part(topic,':',3)::uuid;
 select * into g from public.golf_games where id=game_uuid;
 return coalesce(auth.uid() is not null and private.is_member(g.room_id) and g.player2 is not null
 and actor in(g.player1,g.player2) and (not sending or auth.uid()=actor)
 and not private.people_blocked(g.player1,g.player2),false);
end $$;
revoke all on function public.can_access_golf_live(text,boolean) from public,anon;
grant execute on function public.can_access_golf_live(text,boolean) to authenticated;
drop policy if exists tungchat_golf_live_read on realtime.messages;
drop policy if exists tungchat_golf_live_send on realtime.messages;
create policy tungchat_golf_live_read on realtime.messages for select to authenticated using(extension='broadcast' and public.can_access_golf_live((select realtime.topic()),false));
create policy tungchat_golf_live_send on realtime.messages for insert to authenticated with check(extension='broadcast' and public.can_access_golf_live((select realtime.topic()),true));


commit;

-- Count one immutable win per completed game. Clients cannot edit this ledger.
begin;
create table if not exists private.game_wins(
 mode text not null check(mode in('pool','chess','golf')),
 game_id uuid not null,
 winner uuid not null references public.profiles(id) on delete cascade,
 recorded_at timestamptz not null default now(),
 primary key(mode,game_id)
);
alter table private.game_wins drop constraint if exists game_wins_mode_check;
alter table private.game_wins add constraint game_wins_mode_check check(mode in('pool','chess','golf'));
create index if not exists game_wins_winner_mode on private.game_wins(winner,mode);
revoke all on private.game_wins from public,anon,authenticated;
create or replace function private.record_game_win() returns trigger
language plpgsql security definer set search_path='' as $$
declare winner_id uuid;mode_name text;candidate text;
begin
 if tg_table_name in('chat_games','golf_games') then mode_name:=case when tg_table_name='chat_games' then 'pool' else 'golf' end;candidate:=new.state->>'winner';
 else mode_name:='chess';if new.status<>'finished' then return new;end if;candidate:=new.state->'players'->>(new.state->'result'->>'winner');end if;
 if candidate=new.player1::text then winner_id:=new.player1;elsif candidate=new.player2::text then winner_id:=new.player2;else return new;end if;
 if new.player2 is null then return new;end if;
 insert into private.game_wins(mode,game_id,winner) values(mode_name,new.id,winner_id) on conflict(mode,game_id) do nothing;
 return new;
end $$;
revoke all on function private.record_game_win() from public,anon,authenticated;
drop trigger if exists pool_record_win on public.chat_games;
create trigger pool_record_win after insert or update of state on public.chat_games for each row execute function private.record_game_win();
drop trigger if exists chess_record_win on public.chess_games;
create trigger chess_record_win after insert or update of state,status on public.chess_games for each row execute function private.record_game_win();
drop trigger if exists golf_record_win on public.golf_games;
create trigger golf_record_win after insert or update of state on public.golf_games for each row execute function private.record_game_win();
insert into private.game_wins(mode,game_id,winner,recorded_at) select 'golf',id,case when state->>'winner'=player1::text then player1 else player2 end,updated_at from public.golf_games where player2 is not null and state->>'finished'='true' and state->>'winner' in(player1::text,player2::text) on conflict(mode,game_id) do nothing;
-- Recover completed games already stored before this update.
insert into private.game_wins(mode,game_id,winner,recorded_at)
 select 'pool',id,case when state->>'winner'=player1::text then player1 else player2 end,updated_at
 from public.chat_games where player2 is not null and state->>'winner' in(player1::text,player2::text)
 on conflict(mode,game_id) do nothing;
insert into private.game_wins(mode,game_id,winner,recorded_at)
 select 'chess',id,case when state->'players'->>(state->'result'->>'winner')=player1::text then player1 else player2 end,updated_at
 from public.chess_games where status='finished' and player2 is not null and state->'players'->>(state->'result'->>'winner') in(player1::text,player2::text)
 on conflict(mode,game_id) do nothing;
create or replace function public.game_win_totals(player_ids uuid[]) returns table(player_id uuid,mode text,wins bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view wins';end if;
 if coalesce(array_length(player_ids,1),0) not between 1 and 50 then raise exception 'Choose up to 50 players';end if;
 return query select p.id,m.mode,count(w.game_id) from public.profiles p cross join (values('pool'::text),('chess'::text),('golf'::text)) m(mode)
 left join private.game_wins w on w.winner=p.id and w.mode=m.mode
 where p.id=any(player_ids) and not private.people_blocked(auth.uid(),p.id) group by p.id,m.mode;
end $$;
create or replace function public.game_leaderboard(game_mode text) returns table(player_id uuid,username text,avatar_data text,wins bigint,place bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view leaderboards';end if;
 if game_mode is null or game_mode not in('pool','chess','golf') then raise exception 'Unknown game mode';end if;
 return query with totals as(
 select p.id,p.username,p.avatar_data,count(w.game_id) n from public.profiles p
 left join private.game_wins w on w.winner=p.id and w.mode=game_mode
 where not private.people_blocked(auth.uid(),p.id)
 group by p.id,p.username,p.avatar_data having count(w.game_id)>0 or p.id=auth.uid()
 ) select t.id,t.username,t.avatar_data,t.n,dense_rank() over(order by t.n desc)
 from totals t order by t.n desc,lower(t.username),t.id limit 100;
end $$;
revoke all on function public.game_win_totals(uuid[]),public.game_leaderboard(text) from public,anon;
grant execute on function public.game_win_totals(uuid[]),public.game_leaderboard(text) to authenticated;
commit;

begin;
create table if not exists private.online_sessions(
 user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid not null,
 seen_at timestamptz not null default now(),
 primary key(user_id,session_id)
);
create index if not exists online_sessions_seen on private.online_sessions(seen_at);
revoke all on private.online_sessions from public,anon,authenticated;
create or replace function public.touch_presence(session_id uuid,is_online boolean default true) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or session_id is null then raise exception 'Sign in required';end if;
 if is_online then
 insert into private.online_sessions(user_id,session_id,seen_at) values(auth.uid(),session_id,clock_timestamp()) on conflict on constraint online_sessions_pkey do update set seen_at=excluded.seen_at;
 else delete from private.online_sessions s where s.user_id=auth.uid() and s.session_id=touch_presence.session_id;end if;
 delete from private.online_sessions where seen_at<now()-interval '1 day';
end $$;
create or replace function public.presence_status(player_ids uuid[]) returns table(player_id uuid,online boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if coalesce(array_length(player_ids,1),0) not between 1 and 200 then raise exception 'Invalid players';end if;
 return query select p.id,exists(select 1 from private.online_sessions s where s.user_id=p.id and s.seen_at>now()-interval '75 seconds') from public.profiles p where p.id=any(player_ids) and not private.people_blocked(auth.uid(),p.id);
end $$;
create or replace function public.active_chat_games(target_room uuid) returns table(game_id uuid,mode text,label text,turn_id uuid)
language plpgsql security definer set search_path='' as $$
declare game public.chess_games;
begin
 if auth.uid() is null or not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
 -- Finalize expired clocks before listing active chess games.
 for game in select * from public.chess_games g where g.room_id=target_room and g.status='active' and g.seconds>0 and
 (g.state->'clocks'->>'activeSince')::numeric+(g.state->'clocks'->>(g.state->>'turn'))::numeric<=extract(epoch from clock_timestamp())*1000
 order by g.id for update skip locked loop perform private.chess_expire(game);end loop;
 return query select x.id,x.mode,x.label,x.turn_id from (
 select g.id,'pool'::text mode,case when g.player2 is null then '8-ball · Invitation' else '8-ball' end label,
 case when g.state->>'turn'=g.player1::text then g.player1 when g.state->>'turn'=g.player2::text then g.player2 end turn_id,g.updated_at
 from public.chat_games g where g.room_id=target_room and g.state->>'winner' is null
 union all
 select c.id,'chess'::text,case when c.status='pending' then 'Chess · Invitation' else 'Chess' end,
 case when c.state->'players'->>(c.state->>'turn')=c.player1::text then c.player1 when c.state->'players'->>(c.state->>'turn')=c.player2::text then c.player2 end,c.updated_at
 from public.chess_games c where c.room_id=target_room and c.status in('active','pending') and not(auth.uid()=any(c.declined))
 union all
 select g.id,'golf'::text,case when g.player2 is null then 'Mini golf · Invitation' else 'Mini golf' end,(g.state->>'turn')::uuid,g.updated_at from public.golf_games g where g.room_id=target_room and (g.state is null or g.state->>'finished'='false')
 )x order by x.updated_at desc,x.id limit 2;
end $$;
revoke all on function public.touch_presence(uuid,boolean),public.presence_status(uuid[]),public.active_chat_games(uuid) from public,anon;
grant execute on function public.touch_presence(uuid,boolean),public.presence_status(uuid[]),public.active_chat_games(uuid) to authenticated;
commit;

begin;
create table if not exists public.chat_media(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 room_id uuid references public.rooms(id) on delete cascade,
 kind text not null check(kind in('image','emoji')),
 name text not null check(char_length(name) between 1 and 60),
 archived boolean not null default false,
 created_at timestamptz not null default now(),
 check((kind='image' and room_id is not null) or (kind='emoji' and room_id is null))
);
alter table public.chat_media enable row level security;
revoke all on public.chat_media from public,anon,authenticated;
grant select,insert on public.chat_media to authenticated;
grant update(archived) on public.chat_media to authenticated;
create or replace function private.can_read_media(media_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.chat_media a where a.id=media_id and
 (a.owner_id=auth.uid() or (not private.people_blocked(auth.uid(),a.owner_id) and
 (exists(select 1 from public.messages m where m.deleted_at is null and m.body='[[tungchat-media:v1]]'||a.id::text and private.is_member(m.room_id))))))
$$;
revoke all on function private.can_read_media(uuid) from public,anon;
grant execute on function private.can_read_media(uuid) to authenticated;
drop policy if exists media_read on public.chat_media;
create policy media_read on public.chat_media for select to authenticated using(owner_id=auth.uid() or private.can_read_media(id));
drop policy if exists media_insert on public.chat_media;
create policy media_insert on public.chat_media for insert to authenticated with check(owner_id=auth.uid() and not archived and (kind='emoji' or private.is_member(room_id)));
drop policy if exists media_archive on public.chat_media;
create policy media_archive on public.chat_media for update to authenticated using(owner_id=auth.uid() and kind='emoji') with check(owner_id=auth.uid() and kind='emoji');
create or replace function private.validate_media_message() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.chat_media;media_id uuid;
begin
 if new.body like '[[tungchat-media:v1]]%' then
 begin media_id:=substring(new.body from char_length('[[tungchat-media:v1]]')+1)::uuid;exception when others then raise exception 'Invalid image';end;
 select * into a from public.chat_media where id=media_id;
 if a.id is null or a.owner_id<>auth.uid() or a.archived or (a.kind='image' and a.room_id<>new.room_id) then raise exception 'Image unavailable';end if;
 end if;return new;
end $$;
revoke all on function private.validate_media_message() from public,anon,authenticated;
drop trigger if exists message_media_check on public.messages;
create trigger message_media_check before insert on public.messages for each row execute function private.validate_media_message();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tungchat-media','tungchat-media',false,2097152,array['image/jpeg','image/webp','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function private.media_object_id(object_name text) returns uuid language plpgsql immutable set search_path='' as $$
begin if object_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' then return null;end if;return split_part(split_part(object_name,'/',2),'.',1)::uuid;exception when others then return null;end $$;
revoke all on function private.media_object_id(text) from public,anon;
grant execute on function private.media_object_id(text) to authenticated;
drop policy if exists tungchat_media_read on storage.objects;
create policy tungchat_media_read on storage.objects for select to authenticated using(bucket_id='tungchat-media' and private.can_read_media(private.media_object_id(name)));
drop policy if exists tungchat_media_upload on storage.objects;
create policy tungchat_media_upload on storage.objects for insert to authenticated with check(bucket_id='tungchat-media' and exists(select 1 from public.chat_media a where a.id=private.media_object_id(storage.objects.name) and a.owner_id=auth.uid() and storage.objects.name=a.owner_id::text||'/'||a.id::text||'.webp'));
commit;

begin;
create table if not exists private.sudo_audit(
 request_id uuid primary key,
 owner_id uuid not null,
 target_id uuid not null,
 room_id uuid not null,
 message_id uuid not null,
 created_at timestamptz not null default now()
);
revoke all on private.sudo_audit from public,anon,authenticated;
create or replace function public.owner_sudo(target_room uuid,target_username text,message_text text,request_id uuid) returns public.messages
language plpgsql security definer set search_path='' as $$
declare target uuid;result public.messages;old private.sudo_audit;
begin
 if auth.uid() is null or not public.is_app_owner() then raise exception 'Owner access required';end if;
 if request_id is null or not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
 select id into target from public.profiles where username=lower(ltrim(target_username,'@'));
 if target is null or not exists(select 1 from public.room_members where room_id=target_room and user_id=target) then raise exception 'Choose someone in this chat';end if;
 if message_text is null or char_length(btrim(message_text)) not between 1 and 4000 or message_text like '[[tungchat-%' or message_text like '[[sahur-%' then raise exception 'Enter a plain text message (up to 4000 characters)';end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into old from private.sudo_audit a where a.request_id=owner_sudo.request_id;
 if found then
  if old.owner_id<>auth.uid() or old.target_id<>target or old.room_id<>target_room then raise exception 'Request already used';end if;
  select * into result from public.messages where id=old.message_id;return result;
 end if;
 if exists(select 1 from public.room_members m where m.room_id=target_room and private.people_blocked(target,m.user_id)) then raise exception 'Messaging is unavailable for this person';end if;
 insert into public.messages(room_id,sender_id,body) values(target_room,target,btrim(message_text)) returning * into result;
 insert into private.sudo_audit(request_id,owner_id,target_id,room_id,message_id) values(request_id,auth.uid(),target,target_room,result.id);
 return result;
end $$;
revoke all on function public.owner_sudo(uuid,text,text,uuid) from public,anon;
grant execute on function public.owner_sudo(uuid,text,text,uuid) to authenticated;
commit;

-- PocketChat 1.1.1: run after upgrade-1.1.sql, before publishing the update.
-- Safe to rerun; existing messages and reactions are preserved.
begin;
alter table public.message_reactions drop constraint if exists message_reactions_emoji_check;
alter table public.message_reactions add constraint message_reactions_emoji_check check (emoji in ('😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😎', '🤓', '🥳', '🤩', '🤔', '🫡', '🤨', '😐', '😑', '🙄', '😏', '😮', '😲', '😳', '🥺', '🥹', '😢', '😭', '😤', '😡', '🤯', '😱', '😴', '🤤', '🤢', '🤮', '🤡', '💀', '👻', '👽', '🤖', '💩', '👍', '👎', '👏', '🙌', '👐', '🤝', '🙏', '💪', '👊', '✊', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '👋', '🫶', '👀', '🧠', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💖', '🔥', '✨', '⭐', '🌟', '💯', '✅', '❌', '❓', '❗', '🎉', '🎊', '🎂', '🎁', '🏆', '🥇', '🚀', '⚡', '☀️', '🌙', '🌈', '🍀', '🌹', '🐱', '🐶', '🐰', '🐸', '🦆', '🦋', '🍕', '🍔', '🍿', '☕', '🎮', '🎵', '📸', '🗿', '🐀', '🐁', '🐂', '🐃', '🐄', '🐅', '🐆', '🐇', '🐈', '🐉', '🐊', '🐋', '🐌', '🐍', '🐎', '🐏', '🐐', '🐑', '🐒', '🐓', '🐔', '🐕', '🐖', '🐗', '🐘', '🐙', '🐚', '🐛', '🐜', '🐝', '🐞', '🐟', '🐠', '🐡', '🐢', '🐣', '🐤', '🐥', '🐦', '🐧', '🐨', '🐩', '🐪', '🐫', '🐬', '🐭', '🐮', '🐯', '🐲', '🐳', '🐴', '🐵', '🐷', '🐹', '🐺', '🐻', '🐼', '🐽', '🐾', '🌭', '🌮', '🌯', '🌰', '🌱', '🌲', '🌳', '🌴', '🌵', '🌶', '🌷', '🌸', '🌺', '🌻', '🌼', '🌽', '🌾', '🌿', '🍁', '🍂', '🍃', '🍄', '🍅', '🍆', '🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🍖', '🍗', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍞', '🍟', '🍠', '🍡', '🍢', '🍣', '🍤', '🍥', '🍦', '🍧', '🍨', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '🍰', '🍱', '🍲', '🍳', '🍴', '🍵', '🍶', '🍷', '🍸', '🍹', '🍺', '🍻', '🍼', '🍽', '🍾', '🎠', '🎡', '🎢', '🎣', '🎤', '🎥', '🎦', '🎧', '🎨', '🎩', '🎪', '🎫', '🎬', '🎭', '🎯', '🎰', '🎱', '🎲', '🎳', '🎴', '🎶', '🎷', '🎸', '🎹', '🎺', '🎻', '🎼', '🎽', '🎾', '🎿', '🏀', '🏁', '🏂', '🏃', '🏄', '🏅', '🏇', '🏈', '🏉', '🏊', '🚁', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚋', '🚌', '🚍', '🚎', '🚏', '🚐', '🚑', '🚒', '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🚝', '🚞', '🚟', '🚠', '🚡', '🚢', '🚣', '🚤', '🚥', '🚦', '🚧', '🚨', '🚩', '🚪', '🚫', '🚬', '🚭', '🚮', '🚯', '🚰', '🚱', '🚲', '🚳', '🚴', '🚵', '🚶', '🚷', '🚸', '🚹', '🚺', '🚻', '🚼', '🚽', '🚾', '🚿', '🛀', '🛁', '🛂', '🛃', '🛄', '🛅', '💠', '💡', '💢', '💣', '💤', '💥', '💦', '💧', '💨', '💫', '💬', '💭', '💮', '💰', '💱', '💲', '💳', '💴', '💵', '💶', '💷', '💸', '💹', '💺', '💻', '💼', '💽', '💾', '💿', '📀', '📁', '📂', '📃', '📄', '📅', '📆', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '📏', '📐', '📑', '📒', '📓', '📔', '📕', '📖', '📗', '📘', '📙', '📚', '📛', '📜', '📝', '📞', '📟', '📠', '📡', '📢', '📣', '📤', '📥', '📦', '📧', '📨', '📩', '📪', '📫', '📬', '📭', '📮', '📯', '📰', '📱', '📲', '📳', '📴', '📵', '📶', '📷', '📹', '📺', '📻', '📼', '📽', '📾', '📿', '🔀', '🔁', '🔂', '🔃', '🔄', '🔅', '🔆', '🔇', '🔈', '🔉', '🔊', '🔋', '🔌', '🔍', '🔎', '🔏', '🔐', '🔑', '🔒', '🔓', '🔔', '🔕', '🔖', '🔗', '🔘', '🔙', '🔚', '🔛', '🔜', '🔝', '🔞', '🔟', '🔠', '🔡', '🔢', '🔣', '🔤', '🔦', '🔧', '🔨', '🔩', '🔪', '🔫', '🔬', '🔭', '🔮', '🔯', '🔰', '🔱', '🔲', '🔳', '🔴', '🔵', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '🔼', '🔽', '😅', '😇', '😈', '😋', '😌', '😒', '😓', '😔', '😕', '😖', '😗', '😙', '😚', '😛', '😜', '😝', '😞', '😟', '😠', '😣', '😥', '😦', '😧', '😨', '😩', '😪', '😫', '😬', '😯', '😰', '😵', '😶', '😷', '😸', '😹', '😺', '😻', '😼', '😽', '😾', '😿', '🙀', '🙁', '🙅', '🙆', '🙇', '🙈', '🙉', '🙊', '🙋', '🙍', '🙎', '🤀', '🤁', '🤂', '🤃', '🤄', '🤅', '🤆', '🤇', '🤈', '🤉', '🤊', '🤋', '🤏', '🤐', '🤑', '🤒', '🤕', '🤗', '🤙', '🤚', '🤛', '🤜', '🤠', '🤥', '🤦', '🤧', '🤪', '🤫', '🤬', '🤭', '🤰', '🤱', '🤲', '🤳', '🤴', '🤵', '🤶', '🤷', '🤸', '🤹', '🤺', '🤻', '🤼', '🤽', '🤾', '🤿', '🥀', '🥁', '🥂', '🥃', '🥄', '🥅', '🥆', '🥈', '🥉', '🥊', '🥋', '🥌', '🥍', '🥎', '🥏', '🥐', '🥑', '🥒', '🥓', '🥔', '🥕', '🥖', '🥗', '🥘', '🥙', '🥚', '🥛', '🥜', '🥝', '🥞', '🥟', '🥠', '🥡', '🥢', '🥣', '🥤', '🥥', '🥦', '🥧', '🥨', '🥩', '🥪', '🥫', '🥬', '🥭', '🥮', '🥯', '🥱', '🥲', '🥴', '🥵', '🥶', '🥷', '🥸', '🥻', '🥼', '🥽', '🥾', '🥿', '🦀', '🦁', '🦂', '🦃', '🦄', '🦅', '🦇', '🦈', '🦉', '🦊', '🦌', '🦍', '🦎', '🦏', '🦐', '🦑', '🦒', '🦓', '🦔', '🦕', '🦖', '🦗', '🦘', '🦙', '🦚', '🦛', '🦜', '🦝', '🦞', '🦟', '🦠', '🦡', '🦢', '🦣', '🦤', '🦥', '🦦', '🦧', '🦨', '🦩', '🦪', '🦫', '🦬', '🦭', '🦮', '🦯', '🦰', '🦱', '🦲', '🦳', '🦴', '🦵', '🦶', '🦷', '🦸', '🦹', '🦺', '🦻', '🦼', '🦽', '🦾', '🦿', '🧀', '🧁', '🧂', '🧃', '🧄', '🧅', '🧆', '🧇', '🧈', '🧉', '🧊', '🧋', '🧍', '🧎', '🧏', '🧐', '🧑', '🧒', '🧓', '🧔', '🧕', '🧖', '🧗', '🧘', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞', '🧟', '🧢', '🧣', '🧤', '🧥', '🧦', '🧧', '🧨', '🧩', '🧪', '🧫', '🧬', '🧭', '🧮', '🧯', '🧰', '🧱', '🧲', '🧳', '🧴', '🧵', '🧶', '🧷', '🧸', '🧹', '🧺', '🧻', '🧼', '🧽', '🧾', '🧿', '👁', '👂', '👃', '👄', '👅', '👆', '👇', '👈', '👉', '👑', '👒', '👓', '👔', '👕', '👖', '👗', '👘', '👙', '👚', '👛', '👜', '👝', '👞', '👟', '👠', '👡', '👢', '👣', '👤', '👥', '👦', '👧', '👨', '👩', '👪', '👫', '👬', '👭', '👮', '👯', '👰', '👱', '👲', '👳', '👴', '👵', '👶', '👷', '👸', '👹', '👺', '👼', '👾', '👿', '💁', '💂', '💃', '💄', '💅', '💆', '💇', '💈', '💉', '💊', '💋', '💌', '💍', '💎', '💏', '💐', '💑', '💒', '💓', '💗', '💘', '💝', '💞', '💟', '🌀', '🌁', '🌂', '🌃', '🌄', '🌅', '🌆', '🌇', '🌉', '🌊', '🌋', '🌌', '🌍', '🌎', '🌏', '🌐', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘', '🌚', '🌛', '🌜', '🌝', '🌞', '🌠', '🌡', '🌢', '🌣', '🌤', '🌥', '🌦', '🌧', '🌨', '🌩', '🌪', '🌫', '🌬', '🎀', '🎃', '🎄', '🎅', '🎆', '🎇', '🎈', '🎋', '🎌', '🎍', '🎎', '🎏', '🎐', '🎑', '🎒', '🎓'));
create or replace function public.toggle_reaction(target_message uuid, reaction text) returns public.message_reactions
language plpgsql security definer set search_path = '' as $$
declare target public.messages; result public.message_reactions;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if reaction is null or reaction not in ('😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😎', '🤓', '🥳', '🤩', '🤔', '🫡', '🤨', '😐', '😑', '🙄', '😏', '😮', '😲', '😳', '🥺', '🥹', '😢', '😭', '😤', '😡', '🤯', '😱', '😴', '🤤', '🤢', '🤮', '🤡', '💀', '👻', '👽', '🤖', '💩', '👍', '👎', '👏', '🙌', '👐', '🤝', '🙏', '💪', '👊', '✊', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '👋', '🫶', '👀', '🧠', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💖', '🔥', '✨', '⭐', '🌟', '💯', '✅', '❌', '❓', '❗', '🎉', '🎊', '🎂', '🎁', '🏆', '🥇', '🚀', '⚡', '☀️', '🌙', '🌈', '🍀', '🌹', '🐱', '🐶', '🐰', '🐸', '🦆', '🦋', '🍕', '🍔', '🍿', '☕', '🎮', '🎵', '📸', '🗿', '🐀', '🐁', '🐂', '🐃', '🐄', '🐅', '🐆', '🐇', '🐈', '🐉', '🐊', '🐋', '🐌', '🐍', '🐎', '🐏', '🐐', '🐑', '🐒', '🐓', '🐔', '🐕', '🐖', '🐗', '🐘', '🐙', '🐚', '🐛', '🐜', '🐝', '🐞', '🐟', '🐠', '🐡', '🐢', '🐣', '🐤', '🐥', '🐦', '🐧', '🐨', '🐩', '🐪', '🐫', '🐬', '🐭', '🐮', '🐯', '🐲', '🐳', '🐴', '🐵', '🐷', '🐹', '🐺', '🐻', '🐼', '🐽', '🐾', '🌭', '🌮', '🌯', '🌰', '🌱', '🌲', '🌳', '🌴', '🌵', '🌶', '🌷', '🌸', '🌺', '🌻', '🌼', '🌽', '🌾', '🌿', '🍁', '🍂', '🍃', '🍄', '🍅', '🍆', '🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🍖', '🍗', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍞', '🍟', '🍠', '🍡', '🍢', '🍣', '🍤', '🍥', '🍦', '🍧', '🍨', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '🍰', '🍱', '🍲', '🍳', '🍴', '🍵', '🍶', '🍷', '🍸', '🍹', '🍺', '🍻', '🍼', '🍽', '🍾', '🎠', '🎡', '🎢', '🎣', '🎤', '🎥', '🎦', '🎧', '🎨', '🎩', '🎪', '🎫', '🎬', '🎭', '🎯', '🎰', '🎱', '🎲', '🎳', '🎴', '🎶', '🎷', '🎸', '🎹', '🎺', '🎻', '🎼', '🎽', '🎾', '🎿', '🏀', '🏁', '🏂', '🏃', '🏄', '🏅', '🏇', '🏈', '🏉', '🏊', '🚁', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚋', '🚌', '🚍', '🚎', '🚏', '🚐', '🚑', '🚒', '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🚝', '🚞', '🚟', '🚠', '🚡', '🚢', '🚣', '🚤', '🚥', '🚦', '🚧', '🚨', '🚩', '🚪', '🚫', '🚬', '🚭', '🚮', '🚯', '🚰', '🚱', '🚲', '🚳', '🚴', '🚵', '🚶', '🚷', '🚸', '🚹', '🚺', '🚻', '🚼', '🚽', '🚾', '🚿', '🛀', '🛁', '🛂', '🛃', '🛄', '🛅', '💠', '💡', '💢', '💣', '💤', '💥', '💦', '💧', '💨', '💫', '💬', '💭', '💮', '💰', '💱', '💲', '💳', '💴', '💵', '💶', '💷', '💸', '💹', '💺', '💻', '💼', '💽', '💾', '💿', '📀', '📁', '📂', '📃', '📄', '📅', '📆', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '📏', '📐', '📑', '📒', '📓', '📔', '📕', '📖', '📗', '📘', '📙', '📚', '📛', '📜', '📝', '📞', '📟', '📠', '📡', '📢', '📣', '📤', '📥', '📦', '📧', '📨', '📩', '📪', '📫', '📬', '📭', '📮', '📯', '📰', '📱', '📲', '📳', '📴', '📵', '📶', '📷', '📹', '📺', '📻', '📼', '📽', '📾', '📿', '🔀', '🔁', '🔂', '🔃', '🔄', '🔅', '🔆', '🔇', '🔈', '🔉', '🔊', '🔋', '🔌', '🔍', '🔎', '🔏', '🔐', '🔑', '🔒', '🔓', '🔔', '🔕', '🔖', '🔗', '🔘', '🔙', '🔚', '🔛', '🔜', '🔝', '🔞', '🔟', '🔠', '🔡', '🔢', '🔣', '🔤', '🔦', '🔧', '🔨', '🔩', '🔪', '🔫', '🔬', '🔭', '🔮', '🔯', '🔰', '🔱', '🔲', '🔳', '🔴', '🔵', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '🔼', '🔽', '😅', '😇', '😈', '😋', '😌', '😒', '😓', '😔', '😕', '😖', '😗', '😙', '😚', '😛', '😜', '😝', '😞', '😟', '😠', '😣', '😥', '😦', '😧', '😨', '😩', '😪', '😫', '😬', '😯', '😰', '😵', '😶', '😷', '😸', '😹', '😺', '😻', '😼', '😽', '😾', '😿', '🙀', '🙁', '🙅', '🙆', '🙇', '🙈', '🙉', '🙊', '🙋', '🙍', '🙎', '🤀', '🤁', '🤂', '🤃', '🤄', '🤅', '🤆', '🤇', '🤈', '🤉', '🤊', '🤋', '🤏', '🤐', '🤑', '🤒', '🤕', '🤗', '🤙', '🤚', '🤛', '🤜', '🤠', '🤥', '🤦', '🤧', '🤪', '🤫', '🤬', '🤭', '🤰', '🤱', '🤲', '🤳', '🤴', '🤵', '🤶', '🤷', '🤸', '🤹', '🤺', '🤻', '🤼', '🤽', '🤾', '🤿', '🥀', '🥁', '🥂', '🥃', '🥄', '🥅', '🥆', '🥈', '🥉', '🥊', '🥋', '🥌', '🥍', '🥎', '🥏', '🥐', '🥑', '🥒', '🥓', '🥔', '🥕', '🥖', '🥗', '🥘', '🥙', '🥚', '🥛', '🥜', '🥝', '🥞', '🥟', '🥠', '🥡', '🥢', '🥣', '🥤', '🥥', '🥦', '🥧', '🥨', '🥩', '🥪', '🥫', '🥬', '🥭', '🥮', '🥯', '🥱', '🥲', '🥴', '🥵', '🥶', '🥷', '🥸', '🥻', '🥼', '🥽', '🥾', '🥿', '🦀', '🦁', '🦂', '🦃', '🦄', '🦅', '🦇', '🦈', '🦉', '🦊', '🦌', '🦍', '🦎', '🦏', '🦐', '🦑', '🦒', '🦓', '🦔', '🦕', '🦖', '🦗', '🦘', '🦙', '🦚', '🦛', '🦜', '🦝', '🦞', '🦟', '🦠', '🦡', '🦢', '🦣', '🦤', '🦥', '🦦', '🦧', '🦨', '🦩', '🦪', '🦫', '🦬', '🦭', '🦮', '🦯', '🦰', '🦱', '🦲', '🦳', '🦴', '🦵', '🦶', '🦷', '🦸', '🦹', '🦺', '🦻', '🦼', '🦽', '🦾', '🦿', '🧀', '🧁', '🧂', '🧃', '🧄', '🧅', '🧆', '🧇', '🧈', '🧉', '🧊', '🧋', '🧍', '🧎', '🧏', '🧐', '🧑', '🧒', '🧓', '🧔', '🧕', '🧖', '🧗', '🧘', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞', '🧟', '🧢', '🧣', '🧤', '🧥', '🧦', '🧧', '🧨', '🧩', '🧪', '🧫', '🧬', '🧭', '🧮', '🧯', '🧰', '🧱', '🧲', '🧳', '🧴', '🧵', '🧶', '🧷', '🧸', '🧹', '🧺', '🧻', '🧼', '🧽', '🧾', '🧿', '👁', '👂', '👃', '👄', '👅', '👆', '👇', '👈', '👉', '👑', '👒', '👓', '👔', '👕', '👖', '👗', '👘', '👙', '👚', '👛', '👜', '👝', '👞', '👟', '👠', '👡', '👢', '👣', '👤', '👥', '👦', '👧', '👨', '👩', '👪', '👫', '👬', '👭', '👮', '👯', '👰', '👱', '👲', '👳', '👴', '👵', '👶', '👷', '👸', '👹', '👺', '👼', '👾', '👿', '💁', '💂', '💃', '💄', '💅', '💆', '💇', '💈', '💉', '💊', '💋', '💌', '💍', '💎', '💏', '💐', '💑', '💒', '💓', '💗', '💘', '💝', '💞', '💟', '🌀', '🌁', '🌂', '🌃', '🌄', '🌅', '🌆', '🌇', '🌉', '🌊', '🌋', '🌌', '🌍', '🌎', '🌏', '🌐', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘', '🌚', '🌛', '🌜', '🌝', '🌞', '🌠', '🌡', '🌢', '🌣', '🌤', '🌥', '🌦', '🌧', '🌨', '🌩', '🌪', '🌫', '🌬', '🎀', '🎃', '🎄', '🎅', '🎆', '🎇', '🎈', '🎋', '🎌', '🎍', '🎎', '🎏', '🎐', '🎑', '🎒', '🎓') then
    raise exception 'Unsupported reaction';
  end if;
  select * into target from public.messages where id = target_message for update;
  if not found or target.deleted_at is not null or not private.is_member(target.room_id) then
    raise exception 'Message unavailable';
  end if;
  insert into public.message_reactions(message_id, user_id, emoji)
    values (target_message, auth.uid(), reaction)
  on conflict (message_id, user_id, emoji) do update
    set active = not public.message_reactions.active, updated_at = now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.toggle_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;
commit;

begin;
create or replace function public.add_group_member(target_room uuid,other_username text) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if auth.uid() is null or not private.is_member(target_room) or not exists(select 1 from public.rooms where id=target_room and kind='group') then raise exception 'Group unavailable';end if;
 select id into target from public.profiles where lower(username)=lower(btrim(other_username));
 if target is null then raise exception 'No account with that username';end if;
 if exists(select 1 from public.room_members m where m.room_id=target_room and private.people_blocked(target,m.user_id)) then raise exception 'This person cannot be added to this group';end if;
 insert into public.room_members(room_id,user_id) values(target_room,target) on conflict do nothing;
end $$;
revoke all on function public.add_group_member(uuid,text) from public,anon;
grant execute on function public.add_group_member(uuid,text) to authenticated;
commit;

begin;
-- Signaling only. Audio/video is never stored in the database.
create table if not exists private.calls (
 id uuid primary key, room_id uuid not null references public.rooms(id) on delete cascade,
 caller uuid not null references auth.users(id) on delete cascade,
 callee uuid not null references auth.users(id) on delete cascade,
 caller_session uuid not null, callee_session uuid,
 video boolean not null, status text not null default 'ringing' check(status in ('ringing','accepted','ended')),
 offer jsonb, answer jsonb, created_at timestamptz not null default now(),
 caller_seen timestamptz not null default now(), callee_seen timestamptz not null default now(),
 caller_turn_at timestamptz, callee_turn_at timestamptz
);
alter table private.calls enable row level security;
revoke all on private.calls from public,anon,authenticated;
create index if not exists calls_created on private.calls(created_at);
create or replace function private.clean_calls() returns void language sql security definer set search_path='' as $$
 update private.calls set status='ended',offer=null,answer=null
 where status<>'ended' and (created_at<now()-interval '2 hours' or
 (status='ringing' and created_at<now()-interval '45 seconds') or
 caller_seen<now()-interval '60 seconds' or (status='accepted' and callee_seen<now()-interval '60 seconds'));
 delete from private.calls where created_at<now()-interval '1 day';
$$;
create or replace function public.call_action(call_id uuid,device_id uuid,action text,target_room uuid default null,wants_video boolean default true,description jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.calls; other_id uuid; u uuid:=auth.uid();
begin
 if u is null or device_id is null or call_id is null then raise exception 'Sign in to call';end if;
 perform private.clean_calls();
 if action='start' then
  -- Serialize reservation of both participants, including simultaneous crossed calls.
  perform pg_advisory_xact_lock(7239142);
  select * into c from private.calls where id=call_id;
  if found then
   if c.caller=u and c.caller_session=device_id then return to_jsonb(c);end if;
   raise exception 'Call unavailable';
  end if;
  if not private.is_member(target_room) or not exists(select 1 from public.rooms where id=target_room and kind='dm') then raise exception 'Open a direct message to call';end if;
  select user_id into other_id from public.room_members where room_id=target_room and user_id<>u;
  if other_id is null or (select count(*) from public.room_members where room_id=target_room)<>2 or private.people_blocked(u,other_id) then raise exception 'Call unavailable';end if;
  if exists(select 1 from private.calls where status<>'ended' and (caller in (u,other_id) or callee in (u,other_id))) then raise exception 'One of you is already in a call';end if;
  if (select count(*) from private.calls where caller=u and created_at>now()-interval '1 minute')>=5 then raise exception 'Wait a minute before calling again';end if;
  insert into private.calls(id,room_id,caller,callee,caller_session,video) values(call_id,target_room,u,other_id,device_id,coalesce(wants_video,true)) returning * into c;
  return to_jsonb(c);
 end if;
 select * into c from private.calls where id=call_id for update;
 if not found or u not in(c.caller,c.callee) then raise exception 'Call unavailable';end if;
 if action='accept' then
  if u<>c.callee or c.status<>'ringing' or private.people_blocked(c.caller,c.callee) or not private.is_member(c.room_id) then raise exception 'Call no longer available';end if;
  update private.calls set status='accepted',callee_session=device_id,callee_seen=now() where id=c.id;
 elsif action='end' then
  if not ((u=c.caller and device_id=c.caller_session) or (u=c.callee and (c.status='ringing' or device_id=c.callee_session))) then raise exception 'Call is open on another device';end if;
  update private.calls set status='ended',offer=null,answer=null where id=c.id;
 elsif action in ('offer','answer') then
  if c.status<>'accepted' or not private.is_member(c.room_id) or private.people_blocked(c.caller,c.callee) then raise exception 'Call no longer available';end if;
  if description is null or jsonb_typeof(description->'sdp') is distinct from 'string' or coalesce(length(description->>'sdp'),0) not between 10 and 100000 or description->>'type' is distinct from action then raise exception 'Invalid call description';end if;
  description:=jsonb_build_object('type',action,'sdp',description->>'sdp');
  if action='offer' and u=c.caller and device_id=c.caller_session and c.offer is null then update private.calls set offer=description where id=c.id;
  elsif action='answer' and u=c.callee and device_id=c.callee_session and c.offer is not null and c.answer is null then update private.calls set answer=description where id=c.id;
  else raise exception 'Call changed or belongs to another device';end if;
 else raise exception 'Invalid call action';end if;
 select * into c from private.calls where id=call_id;return to_jsonb(c);
end $$;
create or replace function public.poll_calls(device_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.calls;u uuid:=auth.uid();
begin
 if u is null or device_id is null then raise exception 'Sign in to call';end if;
 perform private.clean_calls();
 update private.calls set status='ended',offer=null,answer=null where status<>'ended' and u in(caller,callee) and (private.people_blocked(caller,callee) or not private.is_member(room_id));
 select * into c from private.calls where status<>'ended' and ((caller=u and caller_session=device_id) or (callee=u and (status='ringing' or callee_session=device_id))) order by created_at desc limit 1;
 if not found then return null;end if;
 update private.calls set caller_seen=case when caller=u then now() else caller_seen end,callee_seen=case when callee=u and status='accepted' then now() else callee_seen end where id=c.id;
 return to_jsonb(c);
end $$;
-- Limit TURN credential creation to an accepted call on this device, once per minute.
create or replace function public.authorize_call_relay(call_id uuid,device_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare c private.calls;u uuid:=auth.uid();
begin
 select * into c from private.calls where id=call_id for update;
 if u is null or c.status is distinct from 'accepted' or c.created_at<now()-interval '2 hours' or c.caller_seen<now()-interval '60 seconds' or c.callee_seen<now()-interval '60 seconds' or not private.is_member(c.room_id) or private.people_blocked(c.caller,c.callee) then return false;end if;
 if u=c.caller and device_id=c.caller_session and (c.caller_turn_at is null or c.caller_turn_at<now()-interval '1 minute') then update private.calls set caller_turn_at=now() where id=c.id;return true;end if;
 if u=c.callee and device_id=c.callee_session and (c.callee_turn_at is null or c.callee_turn_at<now()-interval '1 minute') then update private.calls set callee_turn_at=now() where id=c.id;return true;end if;
 return false;
end $$;
revoke all on function private.clean_calls() from public,anon,authenticated;
revoke all on function public.call_action(uuid,uuid,text,uuid,boolean,jsonb),public.poll_calls(uuid),public.authorize_call_relay(uuid,uuid) from public,anon;
grant execute on function public.call_action(uuid,uuid,text,uuid,boolean,jsonb),public.poll_calls(uuid),public.authorize_call_relay(uuid,uuid) to authenticated;
-- Cleanup also runs on all call requests. If Cron is installed, remove abandoned data without traffic.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  if exists(select 1 from cron.job where jobname='sahur-call-cleanup') then perform cron.unschedule('sahur-call-cleanup');end if;
  perform cron.schedule('sahur-call-cleanup','* * * * *','select private.clean_calls()');
 end if;
end $$;
commit;

begin;
create table if not exists public.emoji_collection(user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,media_id uuid not null references public.chat_media(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,media_id));
create table if not exists private.message_emoji_refs(message_id uuid references public.messages(id) on delete cascade,media_id uuid references public.chat_media(id) on delete cascade,primary key(message_id,media_id));
revoke all on private.message_emoji_refs from public,anon,authenticated;
alter table public.emoji_collection enable row level security;
revoke all on public.emoji_collection from public,anon,authenticated;
create or replace function private.can_read_media(media_id uuid) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.chat_media a where a.id=media_id and (a.owner_id=auth.uid() or (not private.people_blocked(auth.uid(),a.owner_id) and (exists(select 1 from public.emoji_collection e where e.user_id=auth.uid() and e.media_id=a.id) or exists(select 1 from public.messages m where m.deleted_at is null and private.is_member(m.room_id) and (m.body='[[tungchat-media:v1]]'||a.id::text or (a.kind='emoji' and exists(select 1 from private.message_emoji_refs r where r.message_id=m.id and r.media_id=a.id)))))))) $$;
create or replace function public.save_custom_emoji(emoji_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
if auth.uid() is null or not private.can_read_media(emoji_id) or not exists(select 1 from public.chat_media where id=emoji_id and kind='emoji') then raise exception 'Emoji unavailable';end if;
insert into public.emoji_collection(user_id,media_id) values(auth.uid(),emoji_id) on conflict do nothing;end $$;
create or replace function public.my_custom_emojis() returns setof public.chat_media language sql stable security definer set search_path='' as $$ select a.* from public.chat_media a where a.kind='emoji' and ((a.owner_id=auth.uid() and not a.archived) or exists(select 1 from public.emoji_collection e where e.user_id=auth.uid() and e.media_id=a.id)) and private.can_read_media(a.id) order by a.created_at desc $$;
create or replace function public.remove_custom_emoji(emoji_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 delete from public.emoji_collection where user_id=auth.uid() and media_id=emoji_id;
 update public.chat_media set archived=true where id=emoji_id and owner_id=auth.uid() and kind='emoji';end $$;
create or replace function private.validate_media_message() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.chat_media;media_id uuid;match text[];
begin
 if new.body like '[[tungchat-media:v1]]%' then
 begin media_id:=substring(new.body from char_length('[[tungchat-media:v1]]')+1)::uuid;exception when others then raise exception 'Invalid image';end;
 select * into a from public.chat_media where id=media_id;
 if a.id is null or not ((a.owner_id=auth.uid() and not a.archived) or (a.kind='emoji' and exists(select 1 from public.emoji_collection e where e.user_id=auth.uid() and e.media_id=a.id))) or (a.kind='image' and a.room_id<>new.room_id) or not private.can_read_media(a.id) then raise exception 'Image unavailable';end if;
 end if;
 for match in select regexp_matches(new.body,'\[\[emoji:([0-9a-f-]{36})\]\]','g') loop
 select * into a from public.chat_media where id=match[1]::uuid;
 if a.id is null or a.kind<>'emoji' or not private.can_read_media(a.id) or not ((a.owner_id=auth.uid() and not a.archived) or exists(select 1 from public.emoji_collection e where e.user_id=auth.uid() and e.media_id=a.id)) then raise exception 'Save this emoji to your collection first';end if;
 end loop;return new;
end $$;
create or replace function private.link_message_emojis() returns trigger language plpgsql security definer set search_path='' as $$begin
 delete from private.message_emoji_refs where message_id=new.id;
 insert into private.message_emoji_refs select new.id,match[1]::uuid from regexp_matches(new.body,'\[\[emoji:([0-9a-f-]{36})\]\]','g') match on conflict do nothing;return new;end $$;
revoke all on function private.link_message_emojis() from public,anon,authenticated;
drop trigger if exists link_message_emojis on public.messages;create trigger link_message_emojis after insert or update of body on public.messages for each row execute function private.link_message_emojis();
drop trigger if exists message_media_check on public.messages;
create trigger message_media_check before insert or update of body on public.messages for each row execute function private.validate_media_message();
revoke all on function public.save_custom_emoji(uuid),public.my_custom_emojis(),public.remove_custom_emoji(uuid) from public,anon;
grant execute on function public.save_custom_emoji(uuid),public.my_custom_emojis(),public.remove_custom_emoji(uuid) to authenticated;
commit;

begin;
create table if not exists private.app_admins(user_id uuid primary key references public.profiles(id) on delete cascade);
revoke all on private.app_admins from public,anon,authenticated;
create or replace function public.is_app_admin() returns boolean language sql stable security definer set search_path='' as $$select public.is_app_owner() or exists(select 1 from private.app_admins where user_id=auth.uid())$$;
create or replace function public.set_app_admin(username_input text,enabled boolean) returns void language plpgsql security definer set search_path='' as $$ declare u uuid;begin
if not public.is_app_owner() then raise exception 'Owner access required';end if;
select id into u from public.profiles where lower(username)=lower(btrim(username_input));if u is null then raise exception 'User not found';end if;
if enabled then insert into private.app_admins values(u) on conflict do nothing;else delete from private.app_admins where user_id=u;end if;end $$;
create or replace function public.list_app_admins() returns table(username text) language plpgsql security definer set search_path='' as $$begin if not public.is_app_owner() then raise exception 'Owner access required';end if;return query select p.username from public.profiles p join private.app_admins a on a.user_id=p.id order by p.username;end $$;
alter table public.moderation_ip_events add column if not exists match_eligible boolean not null default false;
update public.moderation_ip_events set match_eligible=true where ip_fingerprint in(select ip_fingerprint from public.moderation_ip_events where ip_address is not null and ip_address not in('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet));
create table if not exists private.ignored_ip_fingerprints(fingerprint text primary key);
revoke all on private.ignored_ip_fingerprints from public,anon,authenticated;
insert into private.ignored_ip_fingerprints select distinct ip_fingerprint from public.moderation_ip_events where ip_address in ('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet) on conflict do nothing;
delete from public.moderation_ip_events where ip_fingerprint in(select fingerprint from private.ignored_ip_fingerprints);
create or replace function public.exclude_school_fingerprint(school_ip inet,fingerprint text) returns void language plpgsql security definer set search_path='' as $$begin
if school_ip not in ('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet) or fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid exclusion';end if;
insert into private.ignored_ip_fingerprints values(fingerprint) on conflict do nothing;
delete from public.moderation_ip_events where ip_fingerprint=fingerprint;end $$;
revoke all on function public.exclude_school_fingerprint(inet,text) from public,anon,authenticated;grant execute on function public.exclude_school_fingerprint(inet,text) to service_role;
create or replace function public.record_moderation_ip_event(
  target_user uuid, target_ip inet, target_fingerprint text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if target_user is null or target_ip is null or target_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid moderation event';
  end if;
  if target_ip in ('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet) then
    perform public.exclude_school_fingerprint(target_ip,target_fingerprint);return false;
  end if;
  if exists(select 1 from private.ignored_ip_fingerprints where fingerprint=target_fingerprint) then return false;end if;
  perform private.purge_moderation_ip_events();
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'Account not found';
  end if;
  -- At most one record per account per 15 minutes limits abuse and avoids noisy logs.
  if exists (select 1 from public.moderation_ip_events
             where user_id = target_user and seen_at > now() - interval '15 minutes') then
    return false;
  end if;
  update public.moderation_ip_events set match_eligible=true where ip_fingerprint=target_fingerprint and not match_eligible;
  insert into public.moderation_ip_events(user_id, ip_address, ip_fingerprint,match_eligible)
    values (target_user, target_ip, target_fingerprint,true);
  return true;
end;
$$;
revoke all on function public.record_moderation_ip_event(uuid, inet, text) from public, anon, authenticated;
grant execute on function public.record_moderation_ip_event(uuid, inet, text) to service_role;

create or replace function public.moderation_overview()
returns table (
  account_id uuid,
  username text,
  account_created_at timestamptz,
  last_seen_at timestamptz,
  last_ip text,
  possible_matches jsonb
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required';end if;
  perform private.purge_moderation_ip_events();
  return query
  with recent as (
    select distinct on (e.user_id)
      e.user_id, e.seen_at, host(e.ip_address) as ip, e.ip_fingerprint
    from public.moderation_ip_events e
    where e.seen_at > now() - interval '90 days'
    order by e.user_id, e.seen_at desc, e.id desc
  ), matched_accounts as (
    select a.user_id, b.user_id as matched_user_id,
      max(greatest(a.seen_at, b.seen_at)) as last_match_at
    from public.moderation_ip_events a
    join public.moderation_ip_events b
      on b.ip_fingerprint = a.ip_fingerprint
     and b.user_id <> a.user_id
     and b.seen_at > now() - interval '90 days'
    where a.match_eligible and b.match_eligible and a.seen_at > now() - interval '90 days'
    group by a.user_id, b.user_id
  ), matches as (
    select m.user_id,
      jsonb_agg(jsonb_build_object(
        'account_id', p2.id,
        'username', p2.username,
        'last_seen_at', m.last_match_at
      ) order by p2.username) as candidates
    from matched_accounts m
    join public.profiles p2 on p2.id = m.matched_user_id
    group by m.user_id
  )
  select p.id, p.username, u.created_at, r.seen_at, r.ip,
    coalesce(m.candidates, '[]'::jsonb)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join recent r on r.user_id = p.id
  left join matches m on m.user_id = p.id
  order by p.username;
end;
$$;
revoke all on function public.moderation_overview() from public, anon;
grant execute on function public.moderation_overview() to authenticated;
create table if not exists private.activity_log(id bigint generated always as identity primary key,at timestamptz not null default now(),actor uuid,username text,action text not null,room_id uuid,object_id text);
create index if not exists activity_log_at on private.activity_log(at desc);
revoke all on private.activity_log from public,anon,authenticated;
create or replace function private.audit_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;old_data jsonb;who uuid:=auth.uid();event text;rid uuid;
begin
row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;old_data:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
if tg_op='UPDATE' and row_data=old_data then return new;end if;
if tg_table_name='messages' then
 event:=case when tg_op='INSERT' then 'Sent a message' when tg_op='DELETE' or row_data->>'deleted_at' is distinct from old_data->>'deleted_at' then 'Deleted a message' else 'Edited a message' end;
 who:=coalesce(who,(row_data->>'sender_id')::uuid);
elsif tg_table_name='room_members' then event:=case when tg_op='INSERT' then 'Joined or added to a chat' else 'Left or removed from a chat' end;who:=coalesce(who,(row_data->>'user_id')::uuid);
elsif tg_table_name='profiles' then event:=case when tg_op='INSERT' then 'Account created' when tg_op='DELETE' then 'Account deleted' else 'Profile updated' end;who:=coalesce(who,(row_data->>'id')::uuid);
elsif tg_table_name='rooms' then event:='Chat '||lower(tg_op);
elsif tg_table_name='chat_media' then event:=case when tg_op='INSERT' then 'Uploaded '||coalesce(row_data->>'kind','media') else 'Updated media collection' end;
elsif tg_table_name='friendships' then event:='Friendship '||case when tg_op='DELETE' then 'removed' else coalesce(row_data->>'status','updated') end;
elsif tg_table_name='user_blocks' then event:=case when tg_op='DELETE' then 'Unblocked an account' else 'Blocked an account' end;
elsif tg_table_name='message_reactions' then event:=case when row_data->>'active'='false' or tg_op='DELETE' then 'Removed a reaction' else 'Reacted to a message' end;
elsif tg_table_name='hidden_rooms' then event:=case when tg_op='INSERT' then 'Closed a DM' else 'Reopened a DM' end;
elsif tg_table_name='emoji_collection' then event:=case when tg_op='INSERT' then 'Saved a custom emoji' else 'Removed a custom emoji' end;
elsif tg_table_name='app_admins' then event:=case when tg_op='INSERT' then 'Granted moderation access' else 'Removed moderation access' end;
elsif tg_table_name='live_calls' then
 if tg_op='UPDATE' and row_data->>'ended_at' is not distinct from old_data->>'ended_at' then return new;end if;
 event:=case when tg_op='INSERT' then 'Started a call' else 'Call closed' end;who:=case when tg_op='INSERT' then (row_data->>'creator')::uuid else null end;
elsif tg_table_name='live_call_members' then
 if tg_op='UPDATE' and row_data->>'status' is not distinct from old_data->>'status' then return new;end if;
 if row_data->>'status'='invited' then return new;end if;
 event:=case when row_data->>'status'='joined' then 'Joined a call' else 'Call participation ended' end;who:=(row_data->>'user_id')::uuid;
else
 if tg_op='UPDATE' and row_data->>'revision' is not distinct from old_data->>'revision' and row_data->>'player2' is not distinct from old_data->>'player2' then return new;end if;
 event:=replace(tg_table_name,'_',' ')||' '||case when tg_op='INSERT' then 'invited' else 'played' end;
end if;
rid:=nullif(row_data->>'room_id','')::uuid;
insert into private.activity_log(actor,username,action,room_id,object_id) values(who,(select username from public.profiles where id=who),event,rid,coalesce(row_data->>'id',row_data->>'call_id'));
delete from private.activity_log where at<now()-interval '30 days';return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.audit_activity() from public,anon,authenticated;
create or replace function public.moderation_logs(before_id bigint default null) returns setof private.activity_log language plpgsql security definer set search_path='' as $$begin
if not public.is_app_admin() then raise exception 'Admin access required';end if;
delete from private.activity_log where at<now()-interval '30 days';
return query select * from private.activity_log where before_id is null or id<before_id order by id desc limit 100;end $$;
create or replace function public.record_sign_in() returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null then raise exception 'Sign in required';end if;
if not exists(select 1 from private.activity_log where actor=auth.uid() and action='Signed in' and at>now()-interval '15 minutes') then insert into private.activity_log(actor,username,action) select id,username,'Signed in' from public.profiles where id=auth.uid();end if;end $$;
revoke all on function public.is_app_admin(),public.set_app_admin(text,boolean),public.list_app_admins(),public.moderation_logs(bigint),public.record_sign_in() from public,anon;
grant execute on function public.is_app_admin(),public.set_app_admin(text,boolean),public.list_app_admins(),public.moderation_logs(bigint),public.record_sign_in() to authenticated;
do $$declare t text;begin
foreach t in array array['messages','profiles','rooms','room_members','chat_media','friendships','user_blocks','message_reactions','hidden_rooms','emoji_collection','chat_games','chess_games','golf_games'] loop
execute format('drop trigger if exists activity_audit on public.%I',t);execute format('create trigger activity_audit after insert or update or delete on public.%I for each row execute function private.audit_activity()',t);end loop;
if exists(select 1 from pg_extension where extname='pg_cron') then
 if exists(select 1 from cron.job where jobname='sahur-log-retention') then perform cron.unschedule('sahur-log-retention');end if;
 perform cron.schedule('sahur-log-retention','15 * * * *',$job$delete from private.activity_log where at<now()-interval '30 days'$job$);
end if;end $$;
drop trigger if exists admin_activity on private.app_admins;create trigger admin_activity after insert or delete on private.app_admins for each row execute function private.audit_activity();
commit;

begin;
create table if not exists private.live_calls(id uuid primary key,room_id uuid not null references public.rooms(id) on delete cascade,creator uuid not null,video boolean not null,created_at timestamptz not null default now(),connected_at timestamptz,ended_at timestamptz);
create table if not exists private.live_call_members(call_id uuid references private.live_calls(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,device_id uuid,status text not null check(status in('invited','joined','left')),seen_at timestamptz not null default now(),mic boolean not null default true,camera boolean not null default true,connection_id uuid not null default gen_random_uuid(),relay_at timestamptz,primary key(call_id,user_id));
create table if not exists private.live_call_signals(call_id uuid references private.live_calls(id) on delete cascade,sender uuid,recipient uuid,description jsonb not null,primary key(call_id,sender,recipient));
revoke all on private.live_calls,private.live_call_members,private.live_call_signals from public,anon,authenticated;
create unique index if not exists live_call_room on private.live_calls(room_id) where ended_at is null;
create or replace function private.clean_live_calls() returns void language plpgsql security definer set search_path='' as $$begin
 update private.live_call_members set status='left' where status='joined' and seen_at<now()-interval '60 seconds';
 update private.live_call_members m set status='left' where status='invited' and exists(select 1 from private.live_calls c where c.id=m.call_id and c.created_at<now()-interval '45 seconds');
 update private.live_calls c set ended_at=now() where ended_at is null and (created_at<now()-interval '2 hours' or (connected_at is null and created_at<now()-interval '45 seconds') or not exists(select 1 from private.live_call_members m where m.call_id=c.id and m.status='joined') or (connected_at is not null and exists(select 1 from public.rooms where id=c.room_id and kind='dm') and (select count(*) from private.live_call_members m where m.call_id=c.id and m.status='joined')<2));
 delete from private.live_call_signals s where exists(select 1 from private.live_calls c where c.id=s.call_id and c.ended_at is not null) or exists(select 1 from private.live_call_members m where m.call_id=s.call_id and m.user_id in(s.sender,s.recipient) and m.status<>'joined');
 delete from private.live_calls where created_at<now()-interval '1 day';
end $$;
create or replace function public.live_call_action(device_id uuid,action text,call_id uuid default null,target_room uuid default null,wants_video boolean default true,peer_id uuid default null,description jsonb default null,mic_on boolean default true,camera_on boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();c private.live_calls;m private.live_call_members;other uuid;kind text;total integer;
begin
 if u is null or device_id is null then raise exception 'Sign in required';end if;
 perform pg_advisory_xact_lock(7239143);perform private.clean_live_calls();
 if action='start' then
  if not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
  select * into c from private.live_calls where room_id=target_room and ended_at is null;
  if c.id is not null and c.video is distinct from wants_video then raise exception 'A different call type is active. Use the matching voice or video button to join';end if;
  if c.id is null then
   if exists(select 1 from private.live_call_members x join private.live_calls y on y.id=x.call_id where x.user_id=u and x.status='joined' and y.ended_at is null) then raise exception 'Finish your other call first';end if;
   if (select count(*) from private.live_calls where creator=u and created_at>now()-interval '1 minute')>=5 then raise exception 'Wait a minute before calling again';end if;
   select r.kind into kind from public.rooms r where id=target_room;
   if kind='dm' and exists(select 1 from public.room_members r where room_id=target_room and private.people_blocked(u,r.user_id)) then raise exception 'Call unavailable';end if;
   if kind='dm' and exists(select 1 from private.live_call_members x join private.live_calls y on y.id=x.call_id where x.status='joined' and y.ended_at is null and x.user_id in(select user_id from public.room_members where room_id=target_room)) then raise exception 'This person is already in a call';end if;
   insert into private.live_calls(id,room_id,creator,video) values(coalesce(call_id,gen_random_uuid()),target_room,u,coalesce(wants_video,true)) returning * into c;
   insert into private.live_call_members(call_id,user_id,status,camera) select c.id,r.user_id,'invited',c.video from public.room_members r where r.room_id=target_room and not private.people_blocked(u,r.user_id);
  end if;
  call_id:=c.id;action:='join';
 else select * into c from private.live_calls where id=call_id;end if;
 if c.id is null or c.ended_at is not null or not private.is_member(c.room_id) then raise exception 'Call ended or unavailable';end if;
 select * into m from private.live_call_members x where x.call_id=c.id and user_id=u;
 if action='join' then
  if exists(select 1 from private.live_call_members x join private.live_calls y on y.id=x.call_id where x.user_id=u and x.status='joined' and y.ended_at is null and (x.call_id<>c.id or x.device_id<>device_id)) then raise exception 'Already in a call on another device';end if;
  if exists(select 1 from private.live_call_members x where x.call_id=c.id and x.status='joined' and private.people_blocked(u,x.user_id)) then raise exception 'Call unavailable';end if;
  select count(*) into total from private.live_call_members x where x.call_id=c.id and x.status='joined' and x.user_id<>u;if total>=8 then raise exception 'This call is full (8 people)';end if;
  insert into private.live_call_members as x(call_id,user_id,device_id,status,camera) values(c.id,u,device_id,'joined',c.video) on conflict on constraint live_call_members_pkey do update set device_id=excluded.device_id,status='joined',seen_at=now(),mic=true,camera=c.video,relay_at=null,connection_id=gen_random_uuid();
  update private.live_calls set connected_at=coalesce(connected_at,now()) where id=c.id and (select count(*) from private.live_call_members x where x.call_id=c.id and status='joined')>=2;
 elsif action='leave' then
  if m.status='joined' and m.device_id is distinct from device_id then raise exception 'Call is on another device';end if;
  update private.live_call_members x set status='left' where x.call_id=c.id and x.user_id=u;
  if exists(select 1 from public.rooms where id=c.room_id and rooms.kind='dm') then update private.live_calls set ended_at=now() where id=c.id;end if;
 elsif action='signal' then
  if m.status is distinct from 'joined' or m.device_id is distinct from device_id or peer_id=u or not exists(select 1 from private.live_call_members x where x.call_id=c.id and x.user_id=peer_id and status='joined') or private.people_blocked(u,peer_id) then raise exception 'Peer unavailable';end if;
  if description->>'type' is distinct from (case when u::text<peer_id::text then 'offer' else 'answer' end) or jsonb_typeof(description->'sdp') is distinct from 'string' or coalesce(length(description->>'sdp'),0) not between 10 and 100000 then raise exception 'Invalid signal';end if;
  insert into private.live_call_signals as x(call_id,sender,recipient,description) values(c.id,u,peer_id,jsonb_build_object('type',description->>'type','sdp',description->>'sdp')) on conflict on constraint live_call_signals_pkey do nothing;
 elsif action='media' then
  if m.status is distinct from 'joined' or m.device_id is distinct from device_id then raise exception 'Call unavailable';end if;
  update private.live_call_members x set mic=coalesce(mic_on,false),camera=coalesce(camera_on,false) and c.video where x.call_id=c.id and x.user_id=u;
 else raise exception 'Invalid call action';end if;
 perform private.clean_live_calls();return jsonb_build_object('id',c.id);
end $$;
create or replace function public.poll_live_calls(device_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();c private.live_calls;m private.live_call_members;
begin
 if u is null or device_id is null then raise exception 'Sign in required';end if;
 perform private.clean_live_calls();
 -- Leaving the room or blocking a participant immediately cuts signaling access.
 update private.live_call_members x set status='left' from private.live_calls y where x.call_id=y.id and y.ended_at is null and x.user_id=u and (not private.is_member(y.room_id) or exists(select 1 from private.live_call_members z where z.call_id=y.id and z.status='joined' and private.people_blocked(u,z.user_id)));
 select y.* into c from private.live_calls y join private.live_call_members x on x.call_id=y.id where y.ended_at is null and x.user_id=u and (x.status='invited' or(x.status='joined' and x.device_id=device_id)) and private.is_member(y.room_id) order by (x.status='joined') desc,y.created_at desc limit 1;
 if c.id is null then return null;end if;
 select * into m from private.live_call_members x where x.call_id=c.id and x.user_id=u;
 if m.status='joined' then update private.live_call_members x set seen_at=now() where x.call_id=c.id and user_id=u;end if;
 return to_jsonb(c)||jsonb_build_object('self_status',m.status,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',x.user_id,'connection',x.connection_id,'status',x.status,'mic',x.mic,'camera',x.camera)),'[]'::jsonb) from private.live_call_members x where x.call_id=c.id and x.status<>'left'),'signals',case when m.status='joined' then(select coalesce(jsonb_agg(jsonb_build_object('sender',s.sender,'description',s.description)),'[]'::jsonb) from private.live_call_signals s where s.call_id=c.id and s.recipient=u) else '[]'::jsonb end,'group',exists(select 1 from public.rooms where id=c.room_id and kind='group'));
end $$;
create or replace function public.authorize_live_call_relay(call_id uuid,device_id uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
perform private.clean_live_calls();
update private.live_call_members x set relay_at=now() from private.live_calls c where x.call_id=authorize_live_call_relay.call_id and c.id=x.call_id and c.ended_at is null and x.user_id=auth.uid() and x.device_id=authorize_live_call_relay.device_id and x.status='joined' and private.is_member(c.room_id) and exists(select 1 from private.live_call_members y where y.call_id=c.id and y.user_id<>x.user_id and y.status='joined') and not exists(select 1 from private.live_call_members y where y.call_id=c.id and y.status='joined' and private.people_blocked(x.user_id,y.user_id)) and (x.relay_at is null or x.relay_at<now()-interval '1 minute');return found;end $$;
revoke all on function private.clean_live_calls() from public,anon,authenticated;
revoke all on function public.live_call_action(uuid,text,uuid,uuid,boolean,uuid,jsonb,boolean,boolean),public.poll_live_calls(uuid),public.authorize_live_call_relay(uuid,uuid) from public,anon;
grant execute on function public.live_call_action(uuid,text,uuid,uuid,boolean,uuid,jsonb,boolean,boolean),public.poll_live_calls(uuid),public.authorize_live_call_relay(uuid,uuid) to authenticated;
drop trigger if exists activity_audit on private.live_calls;create trigger activity_audit after insert or update on private.live_calls for each row execute function private.audit_activity();
drop trigger if exists activity_audit on private.live_call_members;create trigger activity_audit after insert or update on private.live_call_members for each row execute function private.audit_activity();
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') then
if exists(select 1 from cron.job where jobname='sahur-live-call-cleanup') then perform cron.unschedule('sahur-live-call-cleanup');end if;
perform cron.schedule('sahur-live-call-cleanup','* * * * *','select private.clean_live_calls()');end if;end $$;

-- Support the already-deployed 1.6.9 call-ice function.
create or replace function public.authorize_call_relay(call_id uuid,device_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare c private.calls;u uuid:=auth.uid();
begin
 if exists(select 1 from private.live_calls lc where lc.id=authorize_call_relay.call_id) then return public.authorize_live_call_relay(call_id,device_id);end if;
 select * into c from private.calls where id=call_id for update;
 if u is null or c.status is distinct from 'accepted' or c.created_at<now()-interval '2 hours' or c.caller_seen<now()-interval '60 seconds' or c.callee_seen<now()-interval '60 seconds' or not private.is_member(c.room_id) or private.people_blocked(c.caller,c.callee) then return false;end if;
 if u=c.caller and device_id=c.caller_session and (c.caller_turn_at is null or c.caller_turn_at<now()-interval '1 minute') then update private.calls set caller_turn_at=now() where id=c.id;return true;end if;
 if u=c.callee and device_id=c.callee_session and (c.callee_turn_at is null or c.callee_turn_at<now()-interval '1 minute') then update private.calls set callee_turn_at=now() where id=c.id;return true;end if;
 return false;
end $$;
commit;

begin;
create table if not exists private.app_admins(user_id uuid primary key references public.profiles(id) on delete cascade);
revoke all on private.app_admins from public,anon,authenticated;
create or replace function public.is_app_admin() returns boolean language sql stable security definer set search_path='' as $$select public.is_app_owner() or exists(select 1 from private.app_admins where user_id=auth.uid())$$;
create or replace function public.set_app_admin(username_input text,enabled boolean) returns void language plpgsql security definer set search_path='' as $$ declare u uuid;begin
if not public.is_app_owner() then raise exception 'Owner access required';end if;
select id into u from public.profiles where lower(username)=lower(btrim(username_input));if u is null then raise exception 'User not found';end if;
if enabled then insert into private.app_admins values(u) on conflict do nothing;else delete from private.app_admins where user_id=u;end if;end $$;
create or replace function public.list_app_admins() returns table(username text) language plpgsql security definer set search_path='' as $$begin if not public.is_app_owner() then raise exception 'Owner access required';end if;return query select p.username from public.profiles p join private.app_admins a on a.user_id=p.id order by p.username;end $$;
alter table public.moderation_ip_events add column if not exists match_eligible boolean not null default false;
update public.moderation_ip_events set match_eligible=true where ip_fingerprint in(select ip_fingerprint from public.moderation_ip_events where ip_address is not null and ip_address not in('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet,'168.9.116.17'::inet,'::ffff:168.9.116.17'::inet));
create table if not exists private.ignored_ip_fingerprints(fingerprint text primary key);
revoke all on private.ignored_ip_fingerprints from public,anon,authenticated;
insert into private.ignored_ip_fingerprints select distinct ip_fingerprint from public.moderation_ip_events where ip_address in ('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet,'168.9.116.17'::inet,'::ffff:168.9.116.17'::inet) on conflict do nothing;
delete from public.moderation_ip_events where ip_fingerprint in(select fingerprint from private.ignored_ip_fingerprints);
create or replace function public.exclude_school_fingerprint(school_ip inet,fingerprint text) returns void language plpgsql security definer set search_path='' as $$begin
if school_ip not in ('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet,'168.9.116.17'::inet,'::ffff:168.9.116.17'::inet) or fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid exclusion';end if;
insert into private.ignored_ip_fingerprints values(fingerprint) on conflict do nothing;
delete from public.moderation_ip_events where ip_fingerprint=fingerprint;end $$;
revoke all on function public.exclude_school_fingerprint(inet,text) from public,anon,authenticated;grant execute on function public.exclude_school_fingerprint(inet,text) to service_role;
create or replace function public.record_moderation_ip_event(
  target_user uuid, target_ip inet, target_fingerprint text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if target_user is null or target_ip is null or target_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid moderation event';
  end if;
  if target_ip in ('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet,'168.9.116.17'::inet,'::ffff:168.9.116.17'::inet) then
    perform public.exclude_school_fingerprint(target_ip,target_fingerprint);return false;
  end if;
  if exists(select 1 from private.ignored_ip_fingerprints where fingerprint=target_fingerprint) then return false;end if;
  perform private.purge_moderation_ip_events();
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'Account not found';
  end if;
  -- At most one record per account per 15 minutes limits abuse and avoids noisy logs.
  if exists (select 1 from public.moderation_ip_events
             where user_id = target_user and seen_at > now() - interval '15 minutes') then
    return false;
  end if;
  update public.moderation_ip_events set match_eligible=true where ip_fingerprint=target_fingerprint and not match_eligible;
  insert into public.moderation_ip_events(user_id, ip_address, ip_fingerprint,match_eligible)
    values (target_user, target_ip, target_fingerprint,true);
  return true;
end;
$$;
revoke all on function public.record_moderation_ip_event(uuid, inet, text) from public, anon, authenticated;
grant execute on function public.record_moderation_ip_event(uuid, inet, text) to service_role;

create or replace function public.moderation_overview()
returns table (
  account_id uuid,
  username text,
  account_created_at timestamptz,
  last_seen_at timestamptz,
  last_ip text,
  possible_matches jsonb
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required';end if;
  perform private.purge_moderation_ip_events();
  return query
  with recent as (
    select distinct on (e.user_id)
      e.user_id, e.seen_at, host(e.ip_address) as ip, e.ip_fingerprint
    from public.moderation_ip_events e
    where e.seen_at > now() - interval '90 days'
    order by e.user_id, e.seen_at desc, e.id desc
  ), matched_accounts as (
    select a.user_id, b.user_id as matched_user_id,
      max(greatest(a.seen_at, b.seen_at)) as last_match_at
    from public.moderation_ip_events a
    join public.moderation_ip_events b
      on b.ip_fingerprint = a.ip_fingerprint
     and b.user_id <> a.user_id
     and b.seen_at > now() - interval '90 days'
    where a.match_eligible and b.match_eligible and a.seen_at > now() - interval '90 days'
    group by a.user_id, b.user_id
  ), matches as (
    select m.user_id,
      jsonb_agg(jsonb_build_object(
        'account_id', p2.id,
        'username', p2.username,
        'last_seen_at', m.last_match_at
      ) order by p2.username) as candidates
    from matched_accounts m
    join public.profiles p2 on p2.id = m.matched_user_id
    group by m.user_id
  )
  select p.id, p.username, u.created_at, r.seen_at, r.ip,
    coalesce(m.candidates, '[]'::jsonb)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join recent r on r.user_id = p.id
  left join matches m on m.user_id = p.id
  order by p.username;
end;
$$;
revoke all on function public.moderation_overview() from public, anon;
grant execute on function public.moderation_overview() to authenticated;
create table if not exists private.activity_log(id bigint generated always as identity primary key,at timestamptz not null default now(),actor uuid,username text,action text not null,room_id uuid,object_id text);
create index if not exists activity_log_at on private.activity_log(at desc);
revoke all on private.activity_log from public,anon,authenticated;
create or replace function private.audit_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;old_data jsonb;who uuid:=auth.uid();event text;rid uuid;
begin
row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;old_data:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
if tg_op='UPDATE' and row_data=old_data then return new;end if;
if tg_table_name='messages' then
 event:=case when tg_op='INSERT' then 'Sent a message' when tg_op='DELETE' or row_data->>'deleted_at' is distinct from old_data->>'deleted_at' then 'Deleted a message' else 'Edited a message' end;
 who:=coalesce(who,(row_data->>'sender_id')::uuid);
elsif tg_table_name='room_members' then event:=case when tg_op='INSERT' then 'Joined or added to a chat' else 'Left or removed from a chat' end;who:=coalesce(who,(row_data->>'user_id')::uuid);
elsif tg_table_name='profiles' then event:=case when tg_op='INSERT' then 'Account created' when tg_op='DELETE' then 'Account deleted' else 'Profile updated' end;who:=coalesce(who,(row_data->>'id')::uuid);
elsif tg_table_name='rooms' then event:='Chat '||lower(tg_op);
elsif tg_table_name='chat_media' then event:=case when tg_op='INSERT' then 'Uploaded '||coalesce(row_data->>'kind','media') else 'Updated media collection' end;
elsif tg_table_name='friendships' then event:='Friendship '||case when tg_op='DELETE' then 'removed' else coalesce(row_data->>'status','updated') end;
elsif tg_table_name='user_blocks' then event:=case when tg_op='DELETE' then 'Unblocked an account' else 'Blocked an account' end;
elsif tg_table_name='message_reactions' then event:=case when row_data->>'active'='false' or tg_op='DELETE' then 'Removed a reaction' else 'Reacted to a message' end;
elsif tg_table_name='hidden_rooms' then event:=case when tg_op='INSERT' then 'Closed a DM' else 'Reopened a DM' end;
elsif tg_table_name='emoji_collection' then event:=case when tg_op='INSERT' then 'Saved a custom emoji' else 'Removed a custom emoji' end;
elsif tg_table_name='app_admins' then event:=case when tg_op='INSERT' then 'Granted moderation access' else 'Removed moderation access' end;
elsif tg_table_name='live_calls' then
 if tg_op='UPDATE' and row_data->>'ended_at' is not distinct from old_data->>'ended_at' then return new;end if;
 event:=case when tg_op='INSERT' then 'Started a call' else 'Call closed' end;who:=case when tg_op='INSERT' then (row_data->>'creator')::uuid else null end;
elsif tg_table_name='live_call_members' then
 if tg_op='UPDATE' and row_data->>'status' is not distinct from old_data->>'status' then return new;end if;
 if row_data->>'status'='invited' then return new;end if;
 event:=case when row_data->>'status'='joined' then 'Joined a call' else 'Call participation ended' end;who:=(row_data->>'user_id')::uuid;
else
 if tg_op='UPDATE' and row_data->>'revision' is not distinct from old_data->>'revision' and row_data->>'player2' is not distinct from old_data->>'player2' then return new;end if;
 event:=replace(tg_table_name,'_',' ')||' '||case when tg_op='INSERT' then 'invited' else 'played' end;
end if;
rid:=nullif(row_data->>'room_id','')::uuid;
insert into private.activity_log(actor,username,action,room_id,object_id) values(who,(select username from public.profiles where id=who),event,rid,coalesce(row_data->>'id',row_data->>'call_id'));
delete from private.activity_log where at<now()-interval '30 days';return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.audit_activity() from public,anon,authenticated;
create or replace function public.moderation_logs(before_id bigint default null) returns setof private.activity_log language plpgsql security definer set search_path='' as $$begin
if not public.is_app_admin() then raise exception 'Admin access required';end if;
delete from private.activity_log where at<now()-interval '30 days';
return query select * from private.activity_log where before_id is null or id<before_id order by id desc limit 100;end $$;
create or replace function public.record_sign_in() returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null then raise exception 'Sign in required';end if;
if not exists(select 1 from private.activity_log where actor=auth.uid() and action='Signed in' and at>now()-interval '15 minutes') then insert into private.activity_log(actor,username,action) select id,username,'Signed in' from public.profiles where id=auth.uid();end if;end $$;
revoke all on function public.is_app_admin(),public.set_app_admin(text,boolean),public.list_app_admins(),public.moderation_logs(bigint),public.record_sign_in() from public,anon;
grant execute on function public.is_app_admin(),public.set_app_admin(text,boolean),public.list_app_admins(),public.moderation_logs(bigint),public.record_sign_in() to authenticated;
do $$declare t text;begin
foreach t in array array['messages','profiles','rooms','room_members','chat_media','friendships','user_blocks','message_reactions','hidden_rooms','emoji_collection','chat_games','chess_games','golf_games'] loop
execute format('drop trigger if exists activity_audit on public.%I',t);execute format('create trigger activity_audit after insert or update or delete on public.%I for each row execute function private.audit_activity()',t);end loop;
if exists(select 1 from pg_extension where extname='pg_cron') then
 if exists(select 1 from cron.job where jobname='sahur-log-retention') then perform cron.unschedule('sahur-log-retention');end if;
 perform cron.schedule('sahur-log-retention','15 * * * *',$job$delete from private.activity_log where at<now()-interval '30 days'$job$);
end if;end $$;
drop trigger if exists admin_activity on private.app_admins;create trigger admin_activity after insert or delete on private.app_admins for each row execute function private.audit_activity();
commit;

begin;
create table if not exists private.live_calls(id uuid primary key,room_id uuid not null references public.rooms(id) on delete cascade,creator uuid not null,video boolean not null,created_at timestamptz not null default now(),connected_at timestamptz,ended_at timestamptz);
create table if not exists private.live_call_members(call_id uuid references private.live_calls(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,device_id uuid,status text not null check(status in('invited','joined','left')),seen_at timestamptz not null default now(),mic boolean not null default true,camera boolean not null default true,connection_id uuid not null default gen_random_uuid(),relay_at timestamptz,primary key(call_id,user_id));
create table if not exists private.live_call_signals(call_id uuid references private.live_calls(id) on delete cascade,sender uuid,recipient uuid,description jsonb not null,primary key(call_id,sender,recipient));
revoke all on private.live_calls,private.live_call_members,private.live_call_signals from public,anon,authenticated;
create unique index if not exists live_call_room on private.live_calls(room_id) where ended_at is null;
create or replace function private.clean_live_calls() returns void language plpgsql security definer set search_path='' as $$begin
 update private.live_call_members set status='left' where status='joined' and seen_at<now()-interval '60 seconds';
 update private.live_call_members m set status='left' where status='invited' and exists(select 1 from private.live_calls c where c.id=m.call_id and c.created_at<now()-interval '20 seconds');
 update private.live_calls c set ended_at=now() where ended_at is null and (created_at<now()-interval '2 hours' or not exists(select 1 from private.live_call_members m where m.call_id=c.id and m.status='joined') or (connected_at is not null and exists(select 1 from public.rooms where id=c.room_id and kind='dm') and (select count(*) from private.live_call_members m where m.call_id=c.id and m.status='joined')<2));
 delete from private.live_call_signals s where exists(select 1 from private.live_calls c where c.id=s.call_id and c.ended_at is not null) or exists(select 1 from private.live_call_members m where m.call_id=s.call_id and m.user_id in(s.sender,s.recipient) and m.status<>'joined');
 delete from private.live_calls where created_at<now()-interval '1 day';
end $$;
create or replace function public.live_call_action(device_id uuid,action text,call_id uuid default null,target_room uuid default null,wants_video boolean default true,peer_id uuid default null,description jsonb default null,mic_on boolean default true,camera_on boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();c private.live_calls;m private.live_call_members;other uuid;kind text;total integer;
begin
 if u is null or device_id is null then raise exception 'Sign in required';end if;
 perform pg_advisory_xact_lock(7239143);perform private.clean_live_calls();
 if action='start' then
  if not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
  select * into c from private.live_calls where room_id=target_room and ended_at is null;
  if c.id is not null and c.video is distinct from wants_video then raise exception 'A different call type is active. Use the matching voice or video button to join';end if;
  if c.id is null then
   if exists(select 1 from private.live_call_members x join private.live_calls y on y.id=x.call_id where x.user_id=u and x.status='joined' and y.ended_at is null) then raise exception 'Finish your other call first';end if;
   if (select count(*) from private.live_calls where creator=u and created_at>now()-interval '1 minute')>=5 then raise exception 'Wait a minute before calling again';end if;
   select r.kind into kind from public.rooms r where id=target_room;
   if kind='dm' and exists(select 1 from public.room_members r where room_id=target_room and private.people_blocked(u,r.user_id)) then raise exception 'Call unavailable';end if;
   if kind='dm' and exists(select 1 from private.live_call_members x join private.live_calls y on y.id=x.call_id where x.status='joined' and y.ended_at is null and x.user_id in(select user_id from public.room_members where room_id=target_room)) then raise exception 'This person is already in a call';end if;
   insert into private.live_calls(id,room_id,creator,video) values(coalesce(call_id,gen_random_uuid()),target_room,u,coalesce(wants_video,true)) returning * into c;
   insert into private.live_call_members(call_id,user_id,status,camera) select c.id,r.user_id,'invited',c.video from public.room_members r where r.room_id=target_room and not private.people_blocked(u,r.user_id);
  end if;
  call_id:=c.id;action:='join';
 else select * into c from private.live_calls where id=call_id;end if;
 if c.id is null or c.ended_at is not null or not private.is_member(c.room_id) then raise exception 'Call ended or unavailable';end if;
 select * into m from private.live_call_members x where x.call_id=c.id and user_id=u;
 if action='join' then
  if exists(select 1 from private.live_call_members x join private.live_calls y on y.id=x.call_id where x.user_id=u and x.status='joined' and y.ended_at is null and (x.call_id<>c.id or x.device_id<>device_id)) then raise exception 'Already in a call on another device';end if;
  if exists(select 1 from private.live_call_members x where x.call_id=c.id and x.status='joined' and private.people_blocked(u,x.user_id)) then raise exception 'Call unavailable';end if;
  
  insert into private.live_call_members as x(call_id,user_id,device_id,status,camera) values(c.id,u,device_id,'joined',c.video) on conflict on constraint live_call_members_pkey do update set device_id=excluded.device_id,status='joined',seen_at=now(),mic=true,camera=c.video,relay_at=null,connection_id=gen_random_uuid();
  update private.live_calls set connected_at=coalesce(connected_at,now()) where id=c.id and (select count(*) from private.live_call_members x where x.call_id=c.id and status='joined')>=2;
 elsif action='leave' then
  if m.status='joined' and m.device_id is distinct from device_id then raise exception 'Call is on another device';end if;
  update private.live_call_members x set status='left' where x.call_id=c.id and x.user_id=u;
  if exists(select 1 from public.rooms where id=c.room_id and rooms.kind='dm') then update private.live_calls set ended_at=now() where id=c.id;end if;
 elsif action='signal' then
  if m.status is distinct from 'joined' or m.device_id is distinct from device_id or peer_id=u or not exists(select 1 from private.live_call_members x where x.call_id=c.id and x.user_id=peer_id and status='joined') or private.people_blocked(u,peer_id) then raise exception 'Peer unavailable';end if;
  if description->>'type' is distinct from (case when u::text<peer_id::text then 'offer' else 'answer' end) or jsonb_typeof(description->'sdp') is distinct from 'string' or coalesce(length(description->>'sdp'),0) not between 10 and 100000 then raise exception 'Invalid signal';end if;
  insert into private.live_call_signals as x(call_id,sender,recipient,description) values(c.id,u,peer_id,jsonb_build_object('type',description->>'type','sdp',description->>'sdp')) on conflict on constraint live_call_signals_pkey do nothing;
 elsif action='media' then
  if m.status is distinct from 'joined' or m.device_id is distinct from device_id then raise exception 'Call unavailable';end if;
  update private.live_call_members x set mic=coalesce(mic_on,false),camera=coalesce(camera_on,false) where x.call_id=c.id and x.user_id=u;
 else raise exception 'Invalid call action';end if;
 perform private.clean_live_calls();return jsonb_build_object('id',c.id);
end $$;
create or replace function public.poll_live_calls(device_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();c private.live_calls;m private.live_call_members;
begin
 if u is null or device_id is null then raise exception 'Sign in required';end if;
 perform private.clean_live_calls();
 -- Leaving the room or blocking a participant immediately cuts signaling access.
 update private.live_call_members x set status='left' from private.live_calls y where x.call_id=y.id and y.ended_at is null and x.user_id=u and (not private.is_member(y.room_id) or exists(select 1 from private.live_call_members z where z.call_id=y.id and z.status='joined' and private.people_blocked(u,z.user_id)));
 select y.* into c from private.live_calls y join private.live_call_members x on x.call_id=y.id where y.ended_at is null and x.user_id=u and (x.status='invited' or(x.status='joined' and x.device_id=device_id)) and private.is_member(y.room_id) order by (x.status='joined') desc,y.created_at desc limit 1;
 if c.id is null then return null;end if;
 select * into m from private.live_call_members x where x.call_id=c.id and x.user_id=u;
 if m.status='joined' then update private.live_call_members x set seen_at=now() where x.call_id=c.id and user_id=u;end if;
 return to_jsonb(c)||jsonb_build_object('self_status',m.status,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',x.user_id,'connection',x.connection_id,'status',x.status,'mic',x.mic,'camera',x.camera)),'[]'::jsonb) from private.live_call_members x where x.call_id=c.id and x.status<>'left'),'signals',case when m.status='joined' then(select coalesce(jsonb_agg(jsonb_build_object('sender',s.sender,'description',s.description)),'[]'::jsonb) from private.live_call_signals s where s.call_id=c.id and s.recipient=u) else '[]'::jsonb end,'group',exists(select 1 from public.rooms where id=c.room_id and kind='group'));
end $$;
create or replace function public.authorize_live_call_relay(call_id uuid,device_id uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
perform private.clean_live_calls();
update private.live_call_members x set relay_at=now() from private.live_calls c where x.call_id=authorize_live_call_relay.call_id and c.id=x.call_id and c.ended_at is null and x.user_id=auth.uid() and x.device_id=authorize_live_call_relay.device_id and x.status='joined' and private.is_member(c.room_id) and exists(select 1 from private.live_call_members y where y.call_id=c.id and y.user_id<>x.user_id and y.status='joined') and not exists(select 1 from private.live_call_members y where y.call_id=c.id and y.status='joined' and private.people_blocked(x.user_id,y.user_id)) and (x.relay_at is null or x.relay_at<now()-interval '1 minute');return found;end $$;
revoke all on function private.clean_live_calls() from public,anon,authenticated;
revoke all on function public.live_call_action(uuid,text,uuid,uuid,boolean,uuid,jsonb,boolean,boolean),public.poll_live_calls(uuid),public.authorize_live_call_relay(uuid,uuid) from public,anon;
grant execute on function public.live_call_action(uuid,text,uuid,uuid,boolean,uuid,jsonb,boolean,boolean),public.poll_live_calls(uuid),public.authorize_live_call_relay(uuid,uuid) to authenticated;
drop trigger if exists activity_audit on private.live_calls;create trigger activity_audit after insert or update on private.live_calls for each row execute function private.audit_activity();
drop trigger if exists activity_audit on private.live_call_members;create trigger activity_audit after insert or update on private.live_call_members for each row execute function private.audit_activity();
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') then
if exists(select 1 from cron.job where jobname='sahur-live-call-cleanup') then perform cron.unschedule('sahur-live-call-cleanup');end if;
perform cron.schedule('sahur-live-call-cleanup','* * * * *','select private.clean_live_calls()');end if;end $$;

-- Support the already-deployed 1.6.9 call-ice function.
create or replace function public.authorize_call_relay(call_id uuid,device_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare c private.calls;u uuid:=auth.uid();
begin
 if exists(select 1 from private.live_calls lc where lc.id=authorize_call_relay.call_id) then return public.authorize_live_call_relay(call_id,device_id);end if;
 select * into c from private.calls where id=call_id for update;
 if u is null or c.status is distinct from 'accepted' or c.created_at<now()-interval '2 hours' or c.caller_seen<now()-interval '60 seconds' or c.callee_seen<now()-interval '60 seconds' or not private.is_member(c.room_id) or private.people_blocked(c.caller,c.callee) then return false;end if;
 if u=c.caller and device_id=c.caller_session and (c.caller_turn_at is null or c.caller_turn_at<now()-interval '1 minute') then update private.calls set caller_turn_at=now() where id=c.id;return true;end if;
 if u=c.callee and device_id=c.callee_session and (c.callee_turn_at is null or c.callee_turn_at<now()-interval '1 minute') then update private.calls set callee_turn_at=now() where id=c.id;return true;end if;
 return false;
end $$;
commit;

begin;
create table if not exists public.golf_games(
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.rooms(id) on delete cascade,
 player1 uuid not null references public.profiles(id) on delete cascade,player2 uuid references public.profiles(id) on delete cascade,
 state jsonb,shot jsonb,revision integer not null default 0,updated_at timestamptz not null default now(),check(player1<>player2)
);
alter table public.golf_games add column if not exists hole_count integer not null default 9 check(hole_count in(3,5,9));
create index if not exists golf_room_updated on public.golf_games(room_id,updated_at desc);
alter table public.golf_games enable row level security;
revoke all on public.golf_games from public,anon,authenticated;
grant select on public.golf_games to authenticated;
drop policy if exists golf_read on public.golf_games;
create policy golf_read on public.golf_games for select to authenticated using(private.is_member(room_id));
drop function if exists public.create_golf_game(uuid);
create or replace function public.create_golf_game(target_room uuid,holes integer default 3) returns public.golf_games language plpgsql security definer set search_path='' as $$
declare g public.golf_games;
begin
 if auth.uid() is null or not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
 if holes not in(3,5) or holes is null then raise exception 'Choose 3 or 5 holes';end if;
 insert into public.golf_games(room_id,player1,hole_count) values(target_room,auth.uid(),holes) returning * into g;
 insert into public.messages(room_id,sender_id,body) values(target_room,auth.uid(),'[[sahur-golf:v1]]'||g.id::text);return g;
end $$;
create or replace function public.accept_golf_game(game_id uuid) returns public.golf_games language plpgsql security definer set search_path='' as $$
declare g public.golf_games;seed bigint;course_order jsonb;tee jsonb;tees jsonb:='[[150,395],[95,500],[90,495],[200,565],[100,545],[95,620],[90,675],[90,585],[85,760],[100,720],[100,665],[230,700],[110,690],[220,700],[230,700],[95,740],[95,690],[105,680],[95,750],[95,715],[95,675],[230,685],[95,750],[90,695],[95,575],[230,725],[90,705],[90,735],[95,755]]';
begin
 select * into g from public.golf_games where id=game_id for update;
 if not found or auth.uid() is null or auth.uid()=g.player1 or not private.is_member(g.room_id) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player1) or private.people_blocked(auth.uid(),g.player1) then raise exception 'Game unavailable';end if;
 if g.player2 is not null then if g.player2=auth.uid() then return g;end if;raise exception 'Someone already accepted';end if;
 select jsonb_agg(n) into course_order from (select n from generate_series(1,28) n order by random() limit g.hole_count) choices;tee:=tees->(course_order->>0)::integer;
 seed:=('x'||substr(replace(g.id::text,'-',''),1,8))::bit(32)::bigint;
 update public.golf_games set player2=auth.uid(),state=jsonb_build_object('version',1,'courseSet',case when g.hole_count=9 then 1 else 3 end,'players',jsonb_build_array(auth.uid(),g.player1),'turn',auth.uid(),'hole',0,'obstacleTick',0,'seed',seed,'balls','[{"x":141,"y":395,"sunk":false},{"x":159,"y":395,"sunk":false}]'::jsonb,'scores','[[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]]'::jsonb,'shotNumber',0,'finished',false,'winner',null,'lastHole',null)||case when g.hole_count=9 then '{}'::jsonb else jsonb_build_object('holeCount',g.hole_count,'courseOrder',course_order,'balls',jsonb_build_array(jsonb_build_object('x',(tee->>0)::integer-9,'y',(tee->>1)::integer,'sunk',false),jsonb_build_object('x',(tee->>0)::integer+9,'y',(tee->>1)::integer,'sunk',false))) end,updated_at=now() where id=g.id returning * into g;return g;
end $$;
create or replace function public.submit_golf_shot(game_id uuid,expected_revision integer,shot_data jsonb,end_state jsonb) returns public.golf_games language plpgsql security definer set search_path='' as $$
declare g public.golf_games;s jsonb;h integer;nh integer;i integer;j integer;p integer;k integer;total0 integer:=0;total1 integer:=0;b jsonb;expected_turn text;expected_winner text;starts jsonb:='[[150,395],[95,500],[90,495],[200,565],[100,545],[95,620],[90,675],[90,585],[85,760],[100,720],[100,665],[230,700],[110,690],[220,700],[230,700],[95,740],[95,690],[105,680],[95,750],[95,715],[95,675],[230,685],[95,750],[90,695],[95,575],[230,725],[90,705],[90,735],[95,755]]';
begin
 select * into g from public.golf_games where id=game_id for update;
 if not found or auth.uid() is null or g.player2 is null or auth.uid() not in(g.player1,g.player2) or not private.is_member(g.room_id) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player1) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player2) or private.people_blocked(g.player1,g.player2) then raise exception 'Game unavailable';end if;
 if g.revision=expected_revision+1 and g.shot=shot_data and g.state=end_state then return g;end if;
 if shot_data ? 'assist' and (shot_data->'assist' is distinct from 'true'::jsonb or not public.is_app_owner()) then raise exception 'Owner access required';end if;
 s:=g.state;if s->>'courseSet'='2' then starts:='[[95,500],[100,545],[90,675],[90,585],[85,760]]'::jsonb;end if;if g.revision<>expected_revision or s->>'turn'<>auth.uid()::text or s->>'finished'<>'false' then raise exception 'Turn changed. Reopen the game';end if;
 if jsonb_typeof(shot_data) is distinct from 'object' or jsonb_typeof(end_state) is distinct from 'object' or octet_length(end_state::text)>8000 or octet_length(shot_data::text)>200 or (select count(*) from jsonb_object_keys(shot_data))<>(case when shot_data ? 'assist' then 3 else 2 end) or jsonb_typeof(shot_data->'angle') is distinct from 'number' or jsonb_typeof(shot_data->'power') is distinct from 'number' or abs((shot_data->>'angle')::numeric)>6.284 or (shot_data->>'power')::numeric not between .08 and 1 then raise exception 'Invalid shot';end if;
 if not(end_state ?& array['version','courseSet','players','turn','hole','obstacleTick','seed','balls','scores','shotNumber','finished','winner','lastHole']) or end_state->'version' is distinct from '1'::jsonb or end_state->'courseSet' is distinct from s->'courseSet' or end_state->'holeCount' is distinct from s->'holeCount' or end_state->'courseOrder' is distinct from s->'courseOrder' or end_state->'players' is distinct from s->'players' or end_state->>'turn' not in(g.player1::text,g.player2::text) or jsonb_typeof(end_state->'finished') is distinct from 'boolean' or jsonb_typeof(end_state->'balls') is distinct from 'array' or jsonb_array_length(end_state->'balls')<>2 or jsonb_typeof(end_state->'scores') is distinct from 'array' or jsonb_array_length(end_state->'scores')<>2 then raise exception 'Invalid game state';end if;
 foreach b in array array[end_state->'hole',end_state->'obstacleTick',end_state->'seed',end_state->'shotNumber'] loop if jsonb_typeof(b) is distinct from 'number' or b::text::numeric<>trunc(b::text::numeric) then raise exception 'Invalid game clock';end if;end loop;
 h:=(s->>'hole')::integer;nh:=(end_state->>'hole')::integer;i:=case when s->'players'->>0=auth.uid()::text then 0 else 1 end;j:=1-i;
 if nh not between h and least(h+1,g.hole_count-1) or (end_state->>'shotNumber')::integer<>g.revision+1 or (end_state->>'obstacleTick')::bigint not between (s->>'obstacleTick')::bigint+1 and (s->>'obstacleTick')::bigint+1200 or (end_state->>'seed')::numeric not between 0 and 4294967295 then raise exception 'Invalid progression';end if;
 for p in 0..1 loop
 if jsonb_typeof(end_state->'scores'->p) is distinct from 'array' or jsonb_array_length(end_state->'scores'->p)<>9 then raise exception 'Invalid scores';end if;
 for k in 0..8 loop
 if jsonb_typeof(end_state->'scores'->p->k) is distinct from 'number' or (end_state->'scores'->p->>k)::numeric<>((s->'scores'->p->>k)::numeric+case when p=i and k=h then 1 else 0 end) or (end_state->'scores'->p->>k)::numeric not between 0 and 10 then raise exception 'Invalid score';end if;
 end loop;
 b:=end_state->'balls'->p;
 if jsonb_typeof(b->'x') is distinct from 'number' or jsonb_typeof(b->'y') is distinct from 'number' or jsonb_typeof(b->'sunk') is distinct from 'boolean' or (b->>'x')::numeric not between 0 and 460 or (b->>'y')::numeric not between 0 and 850 then raise exception 'Invalid ball';end if;
 end loop;
 if nh=h then
 if end_state->'balls'->j is distinct from s->'balls'->j then raise exception 'Opponent ball changed';end if;
 if (end_state->'scores'->i->>h)::integer=10 and end_state->'balls'->i->>'sunk'<>'true' then raise exception 'Stroke limit reached';end if;
 if end_state->>'finished'='true' then
  if h<>g.hole_count-1 or end_state->'balls'->0->>'sunk'<>'true' or end_state->'balls'->1->>'sunk'<>'true' or end_state->'lastHole' is distinct from to_jsonb(h) then raise exception 'Game not finished';end if;
  for k in 0..8 loop total0:=total0+(end_state->'scores'->0->>k)::integer;total1:=total1+(end_state->'scores'->1->>k)::integer;end loop;
  expected_winner:=case when total0=total1 then null when total0<total1 then s->'players'->>0 else s->'players'->>1 end;
  if end_state->>'winner' is distinct from expected_winner or end_state->>'turn' is distinct from auth.uid()::text then raise exception 'Invalid result';end if;
 else
  if end_state->'balls'->0->>'sunk'='true' and end_state->'balls'->1->>'sunk'='true' then raise exception 'Advance to the next hole';end if;
  expected_turn:=s->'players'->>(case when end_state->'balls'->i->>'sunk'='true' then j else i end);
  if end_state->>'turn' is distinct from expected_turn or end_state->'winner' is distinct from 'null'::jsonb or end_state->'lastHole' is distinct from 'null'::jsonb then raise exception 'Invalid turn';end if;
 end if;
 else
  if s->'balls'->j->>'sunk'<>'true' or end_state->>'finished'<>'false' or end_state->'winner' is distinct from 'null'::jsonb or end_state->'lastHole' is distinct from to_jsonb(h) or end_state->>'turn' is distinct from s->'players'->>(nh%2) then raise exception 'Hole not finished';end if;
  if s->>'courseSet'='3' then starts:=jsonb_set(starts,array[nh::text],starts->(s->'courseOrder'->>nh)::integer);end if;
  for p in 0..1 loop b:=end_state->'balls'->p;if b->>'sunk'<>'false' or (b->>'x')::numeric<>((starts->nh->>0)::numeric+case when p=0 then -9 else 9 end) or (b->>'y')::numeric<>(starts->nh->>1)::numeric then raise exception 'Invalid next tee';end if;end loop;
 end if;
 update public.golf_games set state=end_state,shot=shot_data,revision=revision+1,updated_at=now() where id=g.id returning * into g;return g;
end $$;
revoke all on function public.create_golf_game(uuid,integer),public.accept_golf_game(uuid),public.submit_golf_shot(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.create_golf_game(uuid,integer),public.accept_golf_game(uuid),public.submit_golf_shot(uuid,integer,jsonb,jsonb) to authenticated;
create or replace function public.can_access_golf_live(topic text,sending boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare game_uuid uuid; actor uuid; g public.golf_games;
begin
 if topic !~ '^sahur-golf:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
 game_uuid:=split_part(topic,':',2)::uuid;actor:=split_part(topic,':',3)::uuid;
 select * into g from public.golf_games where id=game_uuid;
 return coalesce(auth.uid() is not null and private.is_member(g.room_id) and g.player2 is not null
 and actor in(g.player1,g.player2) and (not sending or auth.uid()=actor)
 and not private.people_blocked(g.player1,g.player2),false);
end $$;
revoke all on function public.can_access_golf_live(text,boolean) from public,anon;
grant execute on function public.can_access_golf_live(text,boolean) to authenticated;
drop policy if exists tungchat_golf_live_read on realtime.messages;
drop policy if exists tungchat_golf_live_send on realtime.messages;
create policy tungchat_golf_live_read on realtime.messages for select to authenticated using(extension='broadcast' and public.can_access_golf_live((select realtime.topic()),false));
create policy tungchat_golf_live_send on realtime.messages for insert to authenticated with check(extension='broadcast' and public.can_access_golf_live((select realtime.topic()),true));


commit;

begin;
alter table public.rooms add column if not exists last_activity_at timestamptz;
update public.rooms r set last_activity_at=greatest(r.created_at,coalesce((select max(m.created_at) from public.messages m where m.room_id=r.id),r.created_at)) where last_activity_at is null;
alter table public.rooms alter column last_activity_at set default now();
create or replace function private.bump_room_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.rooms set last_activity_at=greatest(coalesce(last_activity_at,created_at),new.created_at) where id=new.room_id;
 return new;
end $$;
revoke all on function private.bump_room_activity() from public,anon,authenticated;
drop trigger if exists bump_room_activity on public.messages;
create trigger bump_room_activity after insert on public.messages for each row execute function private.bump_room_activity();
commit;
