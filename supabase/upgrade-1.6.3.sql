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

-- Count one immutable win per completed game. Clients cannot edit this ledger.
begin;
create table if not exists private.game_wins(
 mode text not null check(mode in('pool','chess')),
 game_id uuid not null,
 winner uuid not null references public.profiles(id) on delete cascade,
 recorded_at timestamptz not null default now(),
 primary key(mode,game_id)
);
create index if not exists game_wins_winner_mode on private.game_wins(winner,mode);
revoke all on private.game_wins from public,anon,authenticated;
create or replace function private.record_game_win() returns trigger
language plpgsql security definer set search_path='' as $$
declare winner_id uuid;mode_name text;candidate text;
begin
 if tg_table_name='chat_games' then mode_name:='pool';candidate:=new.state->>'winner';
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
 return query select p.id,m.mode,count(w.game_id) from public.profiles p cross join (values('pool'::text),('chess'::text)) m(mode)
 left join private.game_wins w on w.winner=p.id and w.mode=m.mode
 where p.id=any(player_ids) and not private.people_blocked(auth.uid(),p.id) group by p.id,m.mode;
end $$;
create or replace function public.game_leaderboard(game_mode text) returns table(player_id uuid,username text,avatar_data text,wins bigint,place bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view leaderboards';end if;
 if game_mode is null or game_mode not in('pool','chess') then raise exception 'Unknown game mode';end if;
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
create policy media_read on public.chat_media for select to authenticated using(private.can_read_media(id));
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
 if message_text is null or char_length(btrim(message_text)) not between 1 and 4000 or message_text like '[[tungchat-%' then raise exception 'Enter a plain text message (up to 4000 characters)';end if;
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
