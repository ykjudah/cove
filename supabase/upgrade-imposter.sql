begin;
create table if not exists private.imp_games(
 id uuid primary key default gen_random_uuid(), host uuid not null references public.profiles(id) on delete cascade,
 map text not null, imposters int not null, cooldown int not null, tasks int not null, vote_seconds int not null,
 phase text not null default 'lobby', deadline timestamptz, winner text, notice text not null default '', chat jsonb not null default '[]',
 lights_out boolean not null default false, sabotage_ready timestamptz, created timestamptz not null default now()
);
create table if not exists private.imp_seats(
 game uuid not null references private.imp_games(id) on delete cascade, uid uuid not null references public.profiles(id) on delete cascade,
 joined boolean not null default false, role text, alive boolean not null default true, room int not null default 0,
 body boolean not null default false, corpse_room int, meeting_used boolean not null default false,
 todo int[] not null default '{}', done int[] not null default '{}', voted text, next_kill timestamptz, last_move timestamptz, from_room int, arrive_at timestamptz,
 primary key(game,uid)
);
revoke all on private.imp_games,private.imp_seats from public,anon,authenticated;
-- Each edge connects two named rooms. Client geometry uses these same routes.
create or replace function private.imp_edges(m text) returns int[][] language sql immutable as $$
 select case m when 'Keel' then array[[0,1],[0,2],[0,3],[1,4],[4,5],[5,3],[3,6],[6,7],[7,2],[2,8],[8,6]]
 when 'Caldera' then array[[0,1],[1,2],[1,3],[2,4],[3,4],[4,5],[5,6],[6,7],[7,8],[8,3],[7,4]]
 else array[[0,1],[1,2],[1,3],[2,4],[3,4],[4,5],[5,6],[6,7],[7,8],[8,4],[2,8]] end
$$;
create or replace function private.imp_check(g uuid) returns void language plpgsql set search_path='' as $$
declare bad int;good int;remaining int;team text;
begin
 select count(*) filter(where alive and role='Imposter'),count(*) filter(where alive and role='Innocent'),
 coalesce(sum(cardinality(todo)-cardinality(done)) filter(where role='Innocent'),0)
 into bad,good,remaining from private.imp_seats where game=g and joined;
 team:=case when bad=0 then 'Innocent' when bad>=good then 'Imposter' when remaining=0 then 'Innocent' end;
 if team is not null then update private.imp_games set phase='finished',winner=team where id=g;end if;
end $$;
create or replace function private.imp_resolve(g uuid) returns void language plpgsql set search_path='' as $$
declare first_choice text;high_count int;ties int;
begin
 select voted,count(*) into first_choice,high_count from private.imp_seats where game=g and joined and alive and voted is not null group by voted order by count(*) desc limit 1;
 select count(*) into ties from (select voted from private.imp_seats where game=g and alive and joined and voted is not null group by voted having count(*)=high_count) x;
 if ties=1 and first_choice<>'skip' then
  update private.imp_seats set alive=false where game=g and uid=first_choice::uuid;
  update private.imp_games set notice='Player ejected.',chat='[]' where id=g;
 else update private.imp_games set notice='No one was ejected.' where id=g;end if;
 update private.imp_seats set room=0,from_room=null,arrive_at=null,voted=null,body=false,next_kill=now()+make_interval(secs=>z.cooldown)
 from private.imp_games z where game=g and z.id=g;
 update private.imp_games set phase='play',deadline=null where id=g;
 perform private.imp_check(g);
end $$;
create or replace function public.imp_create(map_name text,imposters int,cooldown int,task_count int,vote_seconds int) returns uuid language plpgsql security definer set search_path='' as $$
declare g uuid;
begin
 if auth.uid() is null or map_name not in('Keel','Caldera','Frostline') or imposters not between 1 and 3 or cooldown not between 5 and 90 or task_count not between 1 and 5 or vote_seconds not between 15 and 120 then raise exception 'Invalid match settings';end if;
 insert into private.imp_games(host,map,imposters,cooldown,tasks,vote_seconds) values(auth.uid(),map_name,imposters,cooldown,task_count,vote_seconds) returning id into g;
 insert into private.imp_seats(game,uid,joined) values(g,auth.uid(),true);
 return g;
end $$;
create or replace function public.imp_list() returns table(id uuid,host uuid,map text,phase text,joined boolean,players bigint)
language sql stable security definer set search_path='' as $$
 select z.id,z.host,z.map,z.phase,s.joined,(select count(*) from private.imp_seats p where p.game=z.id and p.joined)
 from private.imp_games z join private.imp_seats s on s.game=z.id and s.uid=auth.uid()
 where s.joined or z.phase='lobby' order by z.created desc
$$;
create or replace function public.imp_action(game_id uuid,act text,arg text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare z private.imp_games;s private.imp_seats;t private.imp_seats;edge int[];ok boolean:=false;n int;target uuid;players jsonb;progress int;total int;
begin
 select * into z from private.imp_games where id=game_id for update;
 select * into s from private.imp_seats where game=game_id and uid=auth.uid();
 if not found then raise exception 'Invitation required';end if;
 if act='join' and z.phase='lobby' then
  if (select count(*) from private.imp_seats where game=game_id and joined)>=12 and not s.joined then raise exception 'Match is full';end if;
  update private.imp_seats set joined=true where game=game_id and uid=s.uid;s.joined:=true;
 end if;
 if not s.joined then raise exception 'Join this lobby first';end if;
 if z.phase='meeting' and now()>=z.deadline then perform private.imp_resolve(game_id);select * into z from private.imp_games where id=game_id;end if;
 if act='read' or act='join' then null;
 elsif act='invite' then
  target:=arg::uuid;
  if z.host<>s.uid or z.phase<>'lobby' or private.people_blocked(s.uid,target) or not exists(select 1 from public.friendships f where f.status='accepted' and (f.sender_id,f.recipient_id) in ((s.uid,target),(target,s.uid))) then raise exception 'Invite an accepted friend from your lobby';end if;
  insert into private.imp_seats(game,uid) values(game_id,target) on conflict do nothing;
 elsif act='configure' then
  if z.host<>s.uid or z.phase<>'lobby' then raise exception 'Only the lobby host can change settings';end if;
  if coalesce((arg::jsonb->>'map') in('Keel','Caldera','Frostline') and (arg::jsonb->>'imposters')::int between 1 and 3
   and (arg::jsonb->>'tasks')::int between 1 and 5 and (arg::jsonb->>'cooldown')::int between 5 and 90
   and (arg::jsonb->>'vote_seconds')::int between 15 and 120,false) is not true then raise exception 'Invalid match settings';end if;
  update private.imp_games set map=arg::jsonb->>'map',imposters=(arg::jsonb->>'imposters')::int,tasks=(arg::jsonb->>'tasks')::int,
   cooldown=(arg::jsonb->>'cooldown')::int,vote_seconds=(arg::jsonb->>'vote_seconds')::int where id=game_id;
 elsif act='start' then
  select count(*) into n from private.imp_seats where game=game_id and joined;
  if z.phase<>'lobby' or z.host<>s.uid or n<2*z.imposters+1 then raise exception 'The host needs more innocents than imposters to start';end if;
  update private.imp_seats p set role='Innocent',todo=(select array_agg(r) from (select r from generate_series(1,8) r order by random(),p.uid limit z.tasks) x),last_move=now() where game=game_id and joined;
  update private.imp_seats set role='Imposter',todo='{}',next_kill=now()+make_interval(secs=>z.cooldown)
   where game=game_id and uid in(select uid from private.imp_seats where game=game_id and joined order by random() limit z.imposters);
  update private.imp_games set phase='play',notice='Match started.' where id=game_id;
 elsif act='leave' then
  delete from private.imp_seats where game=game_id and uid=s.uid;
  if z.host=s.uid then select uid into target from private.imp_seats where game=game_id and joined order by uid limit 1;
   if target is null then delete from private.imp_games where id=game_id;return '{}'::jsonb;end if;
   update private.imp_games set host=target where id=game_id;
  end if;
  if z.phase in('play','meeting') then perform private.imp_check(game_id);end if;
  return '{}'::jsonb;
 elsif z.phase='play' then
  if s.arrive_at>now() then raise exception 'Finish crossing the corridor first';end if;
  case act when 'move' then
   foreach edge slice 1 in array private.imp_edges(z.map) loop
    if s.room=any(edge) and arg::int=any(edge) and s.room<>arg::int then ok:=true;end if;
   end loop;
   if not ok or s.last_move>now()-interval '1 second' then raise exception 'Choose an adjacent room';end if;
   update private.imp_seats set from_room=s.room,room=arg::int,last_move=now(),arrive_at=now()+interval '1.2 seconds' where game=game_id and uid=s.uid;
  when 'task' then
   if z.lights_out then raise exception 'Restore power in Electrical first';end if;
   if s.role<>'Innocent' or not s.room=any(s.todo) or s.room=any(s.done) or s.last_move>now()-interval '1 second' then raise exception 'Task unavailable';end if;
   update private.imp_seats set done=array_append(done,s.room) where game=game_id and uid=s.uid;
   perform private.imp_check(game_id);
  when 'kill' then
   select * into t from private.imp_seats where game=game_id and uid=arg::uuid;
   if not found or not s.alive or s.role<>'Imposter' or s.next_kill>now() or not t.joined or not t.alive or t.role<>'Innocent' or t.room<>s.room or t.arrive_at>now() then raise exception 'Target unavailable or cooldown active';end if;
   update private.imp_seats set alive=false,body=true,corpse_room=t.room where game=game_id and uid=t.uid;
   update private.imp_seats set next_kill=now()+make_interval(secs=>z.cooldown) where game=game_id and uid=s.uid;
   perform private.imp_check(game_id);
  when 'sabotage' then
   if not s.alive or s.role<>'Imposter' or z.lights_out or z.sabotage_ready>now() then raise exception 'Sabotage unavailable';end if;
   update private.imp_games set lights_out=true,sabotage_ready=now()+interval '45 seconds' where id=game_id;
  when 'repair' then
   if not s.alive or not z.lights_out or s.room<>(case z.map when 'Keel' then 5 when 'Caldera' then 3 else 2 end) then raise exception 'Repair power in Electrical';end if;
   update private.imp_games set lights_out=false where id=game_id;
  when 'meeting','report' then
   if not s.alive then raise exception 'Only living players can call meetings';end if;
   if act='report' and not exists(select 1 from private.imp_seats where game=game_id and corpse_room=s.room and body) then raise exception 'No body here';end if;
   if act='meeting' then
    if s.room<>0 or s.meeting_used then raise exception 'Emergency meeting unavailable';end if;
    update private.imp_seats set meeting_used=true where game=game_id and uid=s.uid;
   end if;
   update private.imp_games set phase='meeting',deadline=now()+make_interval(secs=>z.vote_seconds),chat='[]',notice=case act when 'report' then 'Body reported' else 'Emergency meeting' end where id=game_id;
   update private.imp_seats set body=false,voted=null where game=game_id;
  else raise exception 'Action unavailable';end case;
 elsif z.phase='meeting' and s.alive then
  if act='vote' then
   if s.voted is not null or (arg<>'skip' and not exists(select 1 from private.imp_seats where game=game_id and uid::text=arg and alive and joined)) then raise exception 'Invalid vote';end if;
   update private.imp_seats set voted=arg where game=game_id and uid=s.uid;
   if not exists(select 1 from private.imp_seats where game=game_id and joined and alive and voted is null) then perform private.imp_resolve(game_id);end if;
  elsif act='say' and char_length(trim(arg)) between 1 and 280 and jsonb_array_length(z.chat)<100 then
   update private.imp_games set chat=chat||jsonb_build_array(jsonb_build_object('uid',s.uid,'text',trim(arg))) where id=game_id;
  else raise exception 'Meeting action unavailable';end if;
 else raise exception 'Action unavailable';end if;
 select * into z from private.imp_games where id=game_id;
 select * into s from private.imp_seats where game=game_id and uid=auth.uid();
 select jsonb_agg(jsonb_build_object('uid',p.uid,'joined',p.joined,'alive',case when z.phase in('meeting','finished') or p.room=s.room or p.uid=s.uid then p.alive end,
 'room',case when p.body and p.corpse_room=s.room then p.corpse_room when p.alive and p.room=s.room or p.uid=s.uid then p.room end,
 'from_room',case when p.room=s.room and p.alive then p.from_room end,'arrive_at',case when p.room=s.room and p.alive then p.arrive_at end,
 'body',p.body and p.corpse_room=s.room,'role',case when z.phase='finished' or s.role='Imposter' and p.role='Imposter' or p.uid=s.uid then p.role end) order by p.uid)
 into players from private.imp_seats p where p.game=game_id and (p.joined or z.phase='lobby');
 select coalesce(sum(cardinality(done)),0),coalesce(sum(cardinality(todo)),0) into progress,total from private.imp_seats where game=game_id and role='Innocent';
 return jsonb_build_object('game',to_jsonb(z)-'chat','me',to_jsonb(s),'players',players,'progress',progress,'total',total,'chat',case when z.phase='meeting' then z.chat else '[]'::jsonb end);
end $$;
revoke all on function private.imp_edges(text),private.imp_check(uuid),private.imp_resolve(uuid) from public,anon,authenticated;
revoke all on function public.imp_create(text,int,int,int,int),public.imp_list(),public.imp_action(uuid,text,text) from public,anon;
grant execute on function public.imp_create(text,int,int,int,int),public.imp_list(),public.imp_action(uuid,text,text) to authenticated;
drop function if exists public.head_to_head(uuid);
commit;
