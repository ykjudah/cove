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
