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
