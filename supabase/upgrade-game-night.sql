begin;
alter table private.game_wins drop constraint if exists game_wins_mode_check;
alter table private.game_wins add constraint game_wins_mode_check check(mode in ('pool','chess','golf','four'));

create or replace function public.create_game_night_item(target_room uuid,item_kind text) returns uuid
language plpgsql security definer set search_path='' as $$
declare item uuid;
begin
 if not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
 if item_kind not in ('four','poll') or item_kind is null then raise exception 'Unknown item';end if;
 insert into public.messages(room_id,sender_id,body,system_event) values(target_room,auth.uid(),
 case item_kind when 'four' then 'Four in a Row' else 'What should we play?' end,
 case item_kind when 'four' then jsonb_build_object('kind','four','board',repeat('.',42),'players',jsonb_build_array(auth.uid()),'revision',0)
 else jsonb_build_object('kind','poll','votes','{}'::jsonb) end) returning id into item;
 return item;
end $$;

create or replace function public.drop_four_disc(item_id uuid,col integer,expected_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare m public.messages;e jsonb;players jsonb;board text;turn integer;mark text;dest integer;dx integer;dy integer;side integer;cx integer;cy integer;run integer;won boolean:=false;
begin
 select * into m from public.messages where id=item_id for update;
 if not found or not private.is_member(m.room_id) or m.system_event->>'kind' is distinct from 'four' or m.deleted_at is not null then raise exception 'Game unavailable';end if;
 e:=m.system_event;players:=e->'players';board:=e->>'board';turn:=(e->>'revision')::int;
 if expected_revision is distinct from turn or col is null or col not between 0 and 6 then raise exception 'Refresh the board';end if;
 if jsonb_array_length(players)=1 then
  if m.sender_id=auth.uid() or private.people_blocked(m.sender_id,auth.uid()) then raise exception 'Waiting for an opponent';end if;
  players:=players||jsonb_build_array(auth.uid());
 end if;
 if players->>(1-turn%2) is distinct from auth.uid()::text then raise exception 'Wait for your turn';end if;
 mark:=case when turn%2=0 then 'R' else 'Y' end;
 select max(r*7+col) into dest from generate_series(0,5) r where substr(board,r*7+col+1,1)='.';
 if dest is null then raise exception 'Column is full';end if;
 board:=overlay(board placing mark from dest+1 for 1);
 for dx,dy in select * from (values(1,0),(0,1),(1,1),(1,-1)) dirs loop
  run:=1;
  for side in select * from (values(-1),(1)) sides loop
   cx:=col+side*dx;cy:=dest/7+side*dy;
   while cx between 0 and 6 and cy between 0 and 5 and substr(board,cy*7+cx+1,1)=mark loop
    run:=run+1;cx:=cx+side*dx;cy:=cy+side*dy;
   end loop;
  end loop;
  won:=won or run>=4;
 end loop;
 e:=e||jsonb_build_object('players',players,'board',board,'revision',turn+1,'updated_at',now());
 if won then
  e:=e||jsonb_build_object('kind','game_result','winner',auth.uid(),'mode','four');
  insert into private.game_wins(mode,game_id,winner) values('four',item_id,auth.uid());
 elsif turn=41 then e:=e||jsonb_build_object('kind','four_draw');end if;
 update public.messages set system_event=e where id=item_id;
end $$;

create or replace function public.game_night_vote(item_id uuid,choice text,start_game boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare m public.messages;e jsonb;top_count integer;votes_for_choice integer;
begin
 select * into m from public.messages where id=item_id for update;
 if not found or not private.is_member(m.room_id) or m.deleted_at is not null or m.system_event->>'kind' is distinct from 'poll' then raise exception 'Poll unavailable';end if;
 e:=m.system_event;
 if e ? 'started' then raise exception 'This poll has closed';end if;
 if choice is null or choice not in ('pool','chess','golf','four') then raise exception 'Choose a game';end if;
 if start_game then
  if m.sender_id<>auth.uid() then raise exception 'Only the poll creator can start the game';end if;
  select max(n) into top_count from (select count(*) n from jsonb_each_text(e->'votes') group by value) counts;
  select count(*) into votes_for_choice from jsonb_each_text(e->'votes') where value=choice;
  if top_count is null or votes_for_choice<>top_count then raise exception 'Choose a game with the most votes';end if;
  case choice when 'pool' then perform public.create_pool_game(m.room_id);
  when 'chess' then perform public.create_chess_game(m.room_id,0);
  when 'golf' then perform public.create_golf_game(m.room_id,3);
  else perform public.create_game_night_item(m.room_id,'four');end case;
  e:=e||jsonb_build_object('started',choice);
 else e:=jsonb_set(e,array['votes',auth.uid()::text],to_jsonb(choice));end if;
 update public.messages set system_event=e where id=item_id;
end $$;

create or replace function public.head_to_head(other_player uuid) returns table(mode text,wins bigint,losses bigint)
language sql stable security definer set search_path='' as $$
 with matches as (
  select 'pool'::text mode,id,player1,player2 from public.chat_games where auth.uid() in(player1,player2)
  union all select 'chess',id,player1,player2 from public.chess_games where auth.uid() in(player1,player2)
  union all select 'golf',id,player1,player2 from public.golf_games where auth.uid() in(player1,player2)
  union all select 'four',id,(system_event->'players'->>0)::uuid,(system_event->'players'->>1)::uuid
   from public.messages where system_event->>'mode'='four' and system_event->>'kind'='game_result'
   and (system_event->'players') @> jsonb_build_array(auth.uid(),other_player)
 )
 select w.mode,count(*) filter(where w.winner=auth.uid()),count(*) filter(where w.winner=other_player)
 from matches m join private.game_wins w on w.game_id=m.id and w.mode=m.mode
 where other_player in(m.player1,m.player2) and auth.uid()<>other_player
 and not private.people_blocked(auth.uid(),other_player) group by w.mode
$$;

create or replace function public.joinable_chat_calls() returns table(room_id uuid,video boolean,joined bigint)
language plpgsql security definer set search_path='' as $$
begin
 perform private.clean_live_calls();
 return query select c.room_id,c.video,count(*) from private.live_calls c join private.live_call_members cm on cm.call_id=c.id and cm.status='joined'
 where c.ended_at is null and private.is_member(c.room_id) and not exists(select 1 from private.live_call_members x where x.call_id=c.id and x.status='joined' and (x.user_id=auth.uid() or private.people_blocked(auth.uid(),x.user_id))) group by c.id;
end $$;

revoke all on function public.create_game_night_item(uuid,text),public.drop_four_disc(uuid,integer,integer),public.game_night_vote(uuid,text,boolean),public.head_to_head(uuid),public.joinable_chat_calls() from public,anon;
grant execute on function public.create_game_night_item(uuid,text),public.drop_four_disc(uuid,integer,integer),public.game_night_vote(uuid,text,boolean),public.head_to_head(uuid),public.joinable_chat_calls() to authenticated;
create or replace function public.game_win_totals(player_ids uuid[]) returns table(player_id uuid,mode text,wins bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view wins';end if;
 if coalesce(array_length(player_ids,1),0) not between 1 and 50 then raise exception 'Choose up to 50 players';end if;
 return query select p.id,m.mode,count(w.game_id) from public.profiles p cross join (values('pool'::text),('chess'::text),('golf'::text),('four'::text)) m(mode)
 left join private.game_wins w on w.winner=p.id and w.mode=m.mode
 where p.id=any(player_ids) and not private.people_blocked(auth.uid(),p.id) group by p.id,m.mode;
end $$;
create or replace function public.game_leaderboard(game_mode text) returns table(player_id uuid,username text,avatar_data text,wins bigint,place bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view leaderboards';end if;
 if game_mode is null or game_mode not in('pool','chess','golf','four') then raise exception 'Unknown game mode';end if;
 return query with totals as(
 select p.id,p.username,p.avatar_data,count(w.game_id) n from public.profiles p
 left join private.game_wins w on w.winner=p.id and w.mode=game_mode
 where not private.people_blocked(auth.uid(),p.id)
 group by p.id,p.username,p.avatar_data having count(w.game_id)>0 or p.id=auth.uid()
 ) select t.id,t.username,t.avatar_data,t.n,dense_rank() over(order by t.n desc)
 from totals t order by t.n desc,lower(t.username),t.id limit 100;
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
 select m.id,'four'::text,case when m.system_event->>'revision'='0' then 'Four in a Row · Invitation' else 'Four in a Row' end,
 (m.system_event->'players'->>(1-((m.system_event->>'revision')::int%2)))::uuid,coalesce((m.system_event->>'updated_at')::timestamptz,m.created_at)
 from public.messages m where m.room_id=target_room and m.system_event->>'kind'='four' and m.deleted_at is null
 union all
 select c.id,'chess'::text,case when c.status='pending' then 'Chess · Invitation' else 'Chess' end,
 case when c.state->'players'->>(c.state->>'turn')=c.player1::text then c.player1 when c.state->'players'->>(c.state->>'turn')=c.player2::text then c.player2 end,c.updated_at
 from public.chess_games c where c.room_id=target_room and c.status in('active','pending') and not(auth.uid()=any(c.declined))
 union all
 select g.id,'golf'::text,case when g.player2 is null then 'Mini golf · Invitation' else 'Mini golf' end,(g.state->>'turn')::uuid,g.updated_at from public.golf_games g where g.room_id=target_room and (g.state is null or g.state->>'finished'='false')
 )x order by x.updated_at desc,x.id limit 2;
end $$;
commit;
