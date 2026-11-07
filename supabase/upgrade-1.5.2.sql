-- New invitations: the accepting player breaks. Existing matches are unchanged.
begin;
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
revoke all on function public.accept_pool_game(uuid) from public,anon;
grant execute on function public.accept_pool_game(uuid) to authenticated;
commit;
