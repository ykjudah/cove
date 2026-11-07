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
