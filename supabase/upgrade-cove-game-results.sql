begin;
create or replace function private.finish_game_message(game_mode text,game uuid,won_by uuid) returns void language plpgsql security definer set search_path='' as $$
declare first_player uuid;second_player uuid;room uuid;prefix text;
begin
 if game_mode='pool' then select player1,player2,room_id into first_player,second_player,room from public.chat_games where id=game;prefix:='[[tungchat-pool:v1]]';
 elsif game_mode='chess' then select player1,player2,room_id into first_player,second_player,room from public.chess_games where id=game;prefix:='[[tungchat-chess:v1]]';
 elsif game_mode='golf' then select player1,player2,room_id into first_player,second_player,room from public.golf_games where id=game;prefix:='[[sahur-golf:v1]]';else return;end if;
 if room is null or second_player is null then return;end if;
 update public.messages set system_event=jsonb_build_object('kind','game_result','mode',game_mode,'winner',won_by,'players',jsonb_build_array(first_player,second_player)) where room_id=room and (body=prefix||game::text or (game_mode='chess' and body like prefix||game::text||':%'));
end $$;
create or replace function private.finish_game_message_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin perform private.finish_game_message(new.mode,new.game_id,new.winner);return new;end $$;
revoke all on function private.finish_game_message(text,uuid,uuid),private.finish_game_message_trigger() from public,anon,authenticated;
drop trigger if exists cove_game_result on private.game_wins;
create trigger cove_game_result after insert on private.game_wins for each row execute function private.finish_game_message_trigger();
select private.finish_game_message(mode,game_id,winner) from private.game_wins;
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using(private.is_member(room_id) and (system_event->>'kind' is distinct from 'game_result' or (system_event->'players') @> jsonb_build_array(auth.uid())));
commit;
