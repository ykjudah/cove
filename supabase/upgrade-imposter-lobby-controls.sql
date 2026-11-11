-- Imposter lobby, voting, round, and moderator controls.
-- Apply AFTER upgrade-keel-feedback.sql and upgrade-imposter-smooth-movement.sql.
-- Backward compatibility: existing imp_create/imp_list/imp_action remain available.
begin;
alter table private.imp_games
 add column if not exists name text not null default 'Imposter Lobby',
 add column if not exists meeting_cooldown int not null default 30,
 add column if not exists meeting_ready_at timestamptz,
 add column if not exists last_votes jsonb not null default '[]'::jsonb,
 add column if not exists round_ends_at timestamptz,
 add column if not exists round_number int not null default 0;

-- Kick records last until the lobby is explicitly closed and cascade-deleted.
create table if not exists private.imp_kicks(
 game uuid not null references private.imp_games(id) on delete cascade,
 uid uuid not null references public.profiles(id) on delete cascade,
 kicked_by uuid not null references public.profiles(id),
 kicked_at timestamptz not null default now(),
 primary key(game,uid)
);
revoke all on private.imp_kicks from public,anon,authenticated;
-- Override the shared join policy so old clients cannot bypass a host kick.
create or replace function private.imp_can_join(g uuid) returns boolean
language sql stable set search_path='' as $$
 select auth.uid() is not null
 and not exists(select 1 from private.imp_kicks k where k.game=g and k.uid=auth.uid())
 and not exists(select 1 from private.imp_seats s where s.game=g and s.joined
   and private.people_blocked(auth.uid(),s.uid))
$$;
revoke all on function private.imp_can_join(uuid) from public,anon,authenticated;

create or replace function private.imp_check(g uuid) returns void
language plpgsql set search_path='' as $$
declare bad int;good int;remaining int;team text;
begin
 select count(*) filter(where alive and role='Imposter'),
 count(*) filter(where alive and role='Innocent'),
 coalesce(sum(cardinality(todo)-cardinality(done)) filter(where role='Innocent'),0)
 into bad,good,remaining from private.imp_seats where game=g and joined;
 team:=case when bad=0 then 'Innocent' when bad>=good then 'Imposter' when remaining=0 then 'Innocent' end;
 if team is not null then
  update private.imp_games set phase='finished',winner=team,round_ends_at=clock_timestamp()+interval '9 seconds'
  where id=g and phase in ('play','meeting');
 end if;
end $$;

create or replace function private.imp_resolve(g uuid) returns void
language plpgsql set search_path='' as $$
declare first_choice text;high_count int;ties int;
begin
 update private.imp_games set last_votes=(
  select coalesce(jsonb_agg(jsonb_build_object('uid',uid,'choice',voted) order by uid),'[]'::jsonb)
  from private.imp_seats where game=g and joined and voted is not null
 ) where id=g;
 select voted,count(*) into first_choice,high_count from private.imp_seats
 where game=g and joined and alive and voted is not null
 group by voted order by count(*) desc limit 1;
 select count(*) into ties from (
  select voted from private.imp_seats where game=g and alive and joined and voted is not null
  group by voted having count(*)=high_count
 ) x;
 if ties=1 and first_choice<>'skip' then
  update private.imp_seats set alive=false where game=g and uid=first_choice::uuid;
  update private.imp_games set notice='Player ejected.',chat='[]' where id=g;
 else update private.imp_games set notice='No one was ejected.' where id=g;end if;
 update private.imp_seats set room=0,from_room=null,arrive_at=null,voted=null,body=false,
  next_kill=now()+make_interval(secs=>z.cooldown)
 from private.imp_games z where game=g and z.id=g;
 update private.imp_games set phase='play',deadline=null,
  meeting_ready_at=clock_timestamp()+make_interval(secs=>meeting_cooldown)
 where id=g;
 perform private.imp_check(g);
end $$;

create or replace function private.imp_back_to_lobby(g uuid) returns void
language plpgsql set search_path='' as $$
declare center jsonb;current_map text;
begin
 select map into current_map from private.imp_games where id=g and phase='finished' and round_ends_at<=clock_timestamp();
 if not found then return;end if;
 center:=private.imp_layout(current_map)->0;
 update private.imp_seats set role=null,alive=true,room=0,body=false,corpse_room=null,
  meeting_used=false,todo='{}',done='{}',voted=null,next_kill=null,last_move=null,
  from_room=null,arrive_at=null,bx=null,by=null,
  x=(center->>0)::real,y=(center->>1)::real,move_rev=move_rev+1,
  move_credit=12,walked_at=clock_timestamp()
 where game=g;
 update private.imp_games set phase='lobby',winner=null,deadline=null,round_ends_at=null,
  notice='Ready for another round.',chat='[]',last_votes='[]',
  lights_out=false,sabotage_ready=null,meeting_ready_at=null
 where id=g;
end $$;
revoke all on function private.imp_back_to_lobby(uuid) from public,anon,authenticated;

create or replace function public.imp_create_v2(
 map_name text,imposters int,cooldown int,task_count int,vote_seconds int,
 lobby_name text,meeting_cooldown_seconds int
) returns uuid language plpgsql security definer set search_path='' as $$
declare g uuid;clean_name text:=btrim(lobby_name);
begin
 if clean_name is null or char_length(clean_name) not between 1 and 40
 or meeting_cooldown_seconds not between 10 and 120
 then raise exception 'Choose a lobby name (1–40 characters) and meeting cooldown (10–120 seconds)';end if;
 g:=public.imp_create(map_name,imposters,cooldown,task_count,vote_seconds);
 update private.imp_games set name=clean_name,meeting_cooldown=meeting_cooldown_seconds where id=g;
 return g;
end $$;

create or replace function public.imp_list_v2()
returns table(id uuid,host uuid,map text,phase text,joined boolean,players bigint,
 name text,round_number int,is_admin boolean)
language sql stable security definer set search_path='' as $$
 select g.id,g.host,g.map,g.phase,coalesce(s.joined,false),
 (select count(*) from private.imp_seats p where p.game=g.id and p.joined),
 g.name,g.round_number,public.is_app_admin()
 from private.imp_games g left join private.imp_seats s on s.game=g.id and s.uid=auth.uid()
 where auth.uid() is not null and
 (coalesce(s.joined,false) or (g.phase='lobby' and private.imp_can_join(g.id)) or public.is_app_admin())
 order by g.created desc
$$;

create or replace function public.imp_delete_game(game_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 delete from private.imp_games where id=game_id;
 if not found then raise exception 'Game not found';end if;
end $$;

create or replace function public.imp_action_v2(game_id uuid,act text,arg text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare z private.imp_games;s private.imp_seats;t_id uuid;payload jsonb;
 name_input text;cool_input int;result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into z from private.imp_games where id=game_id for update;
 if not found then raise exception 'Match unavailable';end if;
 if z.phase='finished' and z.round_ends_at is not null and z.round_ends_at<=clock_timestamp() then
  perform private.imp_back_to_lobby(game_id);
  select * into z from private.imp_games where id=game_id;
 end if;
 if act='kick' then
  if z.host<>auth.uid() then raise exception 'Only the host can kick players';end if;
  begin t_id:=arg::uuid;
  exception when invalid_text_representation then raise exception 'Invalid player';end;
  if t_id=z.host then raise exception 'Host cannot kick themselves';end if;
  if not exists(select 1 from private.imp_seats where game=game_id and uid=t_id) then
   raise exception 'Player not in this game';
  end if;
  insert into private.imp_kicks(game,uid,kicked_by)
   values(game_id,t_id,auth.uid()) on conflict(game,uid) do nothing;
  delete from private.imp_seats where game=game_id and uid=t_id;
  if z.phase in ('play','meeting') then perform private.imp_check(game_id);end if;
  return public.imp_action_v2(game_id,'read','');
 end if;
 if act='close' then
  if z.host<>auth.uid() then raise exception 'Only the host can close this lobby';end if;
  delete from private.imp_games where id=game_id;
  return '{}'::jsonb;
 end if;
 if act='leave' and z.host=auth.uid() then
  raise exception 'Host must close the lobby explicitly';
 end if;
 if act='configure' then
  if z.host<>auth.uid() or z.phase<>'lobby' then raise exception 'Host only, in lobby';end if;
  payload:=arg::jsonb;
  name_input:=btrim(coalesce(payload->>'name',z.name));
  cool_input:=coalesce((payload->>'meeting_cooldown')::int,z.meeting_cooldown);
  if name_input is null or char_length(name_input) not between 1 and 40
   or cool_input not between 10 and 120 then raise exception 'Invalid lobby name or meeting cooldown';end if;
  perform public.imp_action(game_id,'configure',arg);
  update private.imp_games set name=name_input,meeting_cooldown=cool_input where id=game_id;
  result:=public.imp_action(game_id,'read','');
 elsif act='start' then
  perform public.imp_action(game_id,'start','');
  update private.imp_games set meeting_ready_at=clock_timestamp()+make_interval(secs=>meeting_cooldown),
    round_number=round_number+1,last_votes='[]',round_ends_at=null,deadline=null where id=game_id;
  result:=public.imp_action(game_id,'read','');
 elsif act='kill_nearest' then
  select * into s from private.imp_seats where game=game_id and uid=auth.uid() and joined;
  if not found or z.phase<>'play' or s.role<>'Imposter' or not s.alive then
   raise exception 'Kill unavailable';
  end if;
  if s.next_kill>clock_timestamp() then raise exception 'Kill cooldown active';end if;
  select t.uid into t_id from private.imp_seats t
  where t.game=game_id and t.uid<>s.uid and t.joined and t.alive
   and t.role='Innocent' and t.room=s.room and (t.arrive_at is null or t.arrive_at<=now())
   and private.imp_visible(z.map,s.x,s.y,t.x,t.y,13)
  order by (t.x-s.x)^2+(t.y-s.y)^2,t.uid limit 1;
  if t_id is null then raise exception 'No player within kill range';end if;
  result:=public.imp_action(game_id,'kill',t_id::text);
 elsif act='meeting' then
  if z.meeting_ready_at is not null and z.meeting_ready_at>clock_timestamp() then
   raise exception 'Emergency meeting cooldown active';
  end if;
  result:=public.imp_action(game_id,act,arg);
  update private.imp_games set last_votes='[]' where id=game_id;
  result:=public.imp_action(game_id,'read','');
 elsif act='report' then
  result:=public.imp_action(game_id,act,arg);
  update private.imp_games set last_votes='[]' where id=game_id;
  result:=public.imp_action(game_id,'read','');
 else
  result:=public.imp_action(game_id,act,arg);
 end if;
 if result ? 'game' then
  return result||jsonb_build_object('votes',
   (select coalesce(jsonb_agg(jsonb_build_object('uid',uid,'choice',voted) order by uid),'[]'::jsonb)
    from private.imp_seats where game=game_id and joined and voted is not null
    and (select phase from private.imp_games where id=game_id)='meeting'));
 end if;
 return result;
end $$;
revoke all on function public.imp_create_v2(text,int,int,int,int,text,int),
 public.imp_list_v2(),public.imp_delete_game(uuid),
 public.imp_action_v2(uuid,text,text) from public,anon;
grant execute on function public.imp_create_v2(text,int,int,int,int,text,int),
 public.imp_list_v2(),public.imp_delete_game(uuid),
 public.imp_action_v2(uuid,text,text) to authenticated;
commit;
