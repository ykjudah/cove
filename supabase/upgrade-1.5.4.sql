-- Existing games installation: new rules, owner-only magnets, and private live previews.
begin;
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
