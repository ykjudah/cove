begin;
alter table private.imp_seats add column if not exists suit int check(suit between 0 and 11),
 add column if not exists hat text not null default 'none',
 add column if not exists move_rev bigint not null default 0,
 add column if not exists move_credit real not null default 12;
with ranked as(select game,uid,(row_number() over(partition by game order by uid)-1)%12 color from private.imp_seats where joined)
update private.imp_seats s set suit=ranked.color from ranked where s.game=ranked.game and s.uid=ranked.uid and s.suit is null;
create or replace function private.imp_color_seat() returns trigger language plpgsql set search_path='' as $$
begin
 if new.joined and (new.suit is null or exists(select 1 from private.imp_seats p where p.game=new.game and p.uid<>new.uid and p.joined and p.suit=new.suit)) then
  select c into new.suit from generate_series(0,11)c where not exists(select 1 from private.imp_seats p where p.game=new.game and p.joined and p.suit=c) order by c limit 1;
 end if;
 return new;
end $$;
drop trigger if exists imp_color_seat on private.imp_seats;
create trigger imp_color_seat before insert or update of joined on private.imp_seats for each row execute function private.imp_color_seat();
revoke all on function private.imp_color_seat() from public,anon,authenticated;
create or replace function private.imp_can_join(g uuid) returns boolean language sql stable set search_path='' as $$
 select auth.uid() is not null and not exists(select 1 from private.imp_seats s where s.game=g and s.joined and private.people_blocked(auth.uid(),s.uid))
$$;
revoke all on function private.imp_can_join(uuid) from public,anon,authenticated;
create or replace function public.imp_list() returns table(id uuid,host uuid,map text,phase text,joined boolean,players bigint)
language sql stable security definer set search_path='' as $$
 select z.id,z.host,z.map,z.phase,coalesce(s.joined,false),(select count(*) from private.imp_seats p where p.game=z.id and p.joined)
 from private.imp_games z left join private.imp_seats s on s.game=z.id and s.uid=auth.uid()
 where auth.uid() is not null and (s.joined or (z.phase='lobby' and private.imp_can_join(z.id)))
 order by z.created desc
$$;
create or replace function private.imp_clear(m text,x real,y real) returns boolean language sql immutable set search_path='' as $$
 select -2 not in(private.imp_floor(m,x,y),private.imp_floor(m,x+2,y),private.imp_floor(m,x-2,y),private.imp_floor(m,x,y+2),private.imp_floor(m,x,y-2))
$$;
revoke all on function private.imp_clear(text,real,real) from public,anon,authenticated;

create or replace function private.imp_surface(m text,x double precision,y double precision,furniture boolean) returns int language plpgsql immutable set search_path='' as $$
declare layout jsonb:=private.imp_layout(m);r jsonb;a jsonb;b jsonb;i int;edge int[];dx double precision;dy double precision;f double precision;w double precision;h double precision;pts jsonb;j int;
begin
 for i in 0..8 loop
  r:=layout->i;dx:=abs(x-(r->>0)::real);dy:=abs(y-(r->>1)::real);w:=(r->>2)::real/2;h:=(r->>3)::real/2;
  if dx<=w+.001 and dy<=h+.001 and dx+dy<=w+h-5+.001 then
   if furniture and i=0 and ((dx-w*.52)/(w*.186))^2+((y-(r->>1)::real-h*.36)/(h*.15))^2<1 then return -2;end if;
   if furniture and i>0 and dx<6 and abs(y-((r->>1)::real-h*.48))<2 then return -2;end if;
   return i;end if;
 end loop;
 foreach edge slice 1 in array private.imp_edges(m) loop
  pts:=jsonb_build_array(layout->edge[1],layout->edge[2]);
  if m='Keel' then
   pts:=jsonb_build_array(layout->edge[1]) || (case edge[1]::text||edge[2]::text
    when '01' then '[[235,94],[235,95]]' when '02' then '[[466,94],[466,100]]'
    when '03' then '[[350,174],[354,174]]' when '14' then '[[125,150],[70,150]]'
    when '45' then '[[70,260],[166,260]]' when '53' then '[[260,297],[260,255]]'
    when '36' then '[[425,255],[425,317]]' when '67' then '[[541,317]]'
    when '72' then '[[541,155],[535,155]]' when '28' then '[[642,100]]'
    when '86' then '[[642,317]]' else '[]' end)::jsonb || jsonb_build_array(layout->edge[2]);
  end if;
  for j in 0..jsonb_array_length(pts)-2 loop
  a:=pts->j;b:=pts->(j+1);dx:=(b->>0)::real-(a->>0)::real;dy:=(b->>1)::real-(a->>1)::real;
  f:=greatest(0,least(1,((x-(a->>0)::real)*dx+(y-(a->>1)::real)*dy)/(dx*dx+dy*dy)));
  if (x-(a->>0)::real-f*dx)^2+(y-(a->>1)::real-f*dy)^2<=121.022001 then return -1;end if;
 end loop;end loop;return -2;
end $$;

-- Consume a bounded batch of actual frame inputs in order. A revision makes a retry
-- idempotent. Spare movement time absorbs ordinary network jitter.
create or replace function public.imp_steps(game_id uuid,revision bigint,steps jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<step_batch>>
declare z private.imp_games;s private.imp_seats;v jsonb;dx real;dy real;dist real;credit real;x real;y real;room_id int;stamp timestamptz;
begin
 select * into z from private.imp_games where id=game_id for share;
 select * into s from private.imp_seats where game=game_id and uid=auth.uid() and joined for update;
 if not found or z.phase<>'play' then raise exception 'Match unavailable';end if;
 if jsonb_typeof(steps) is distinct from 'array' or jsonb_array_length(steps) not between 1 and 48 then raise exception 'Invalid steps';end if;
 if revision=s.move_rev then
  stamp:=clock_timestamp();credit:=least(39,s.move_credit+29*greatest(0,extract(epoch from stamp-coalesce(s.walked_at,stamp))));
  x:=s.x;y:=s.y;
  for v in select value from jsonb_array_elements(steps) loop
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>2 or jsonb_typeof(v->0)<>'number' or jsonb_typeof(v->1)<>'number' then raise exception 'Invalid step';end if;
   dx:=(v->>0)::real;dy:=(v->>1)::real;dist:=sqrt(dx*dx+dy*dy);
   if dist>1.31 then raise exception 'Invalid step length';end if;
   if dist>credit then exit;end if;
   if private.imp_clear(z.map,x+dx,y) then x:=x+dx;end if;
   if private.imp_clear(z.map,x,y+dy) then y:=y+dy;end if;
   credit:=credit-dist;
  end loop;
  room_id:=private.imp_floor(z.map,x,y);
  
  update private.imp_seats p set x=step_batch.x,y=step_batch.y,room=room_id,walked_at=stamp,move_credit=credit,move_rev=p.move_rev+1,
   last_move=case when p.room<>room_id then now() else p.last_move end
   where p.game=game_id and p.uid=s.uid returning * into s;
 end if;
 return jsonb_build_object('x',s.x,'y',s.y,'revision',s.move_rev);
end $$;
revoke all on function public.imp_steps(uuid,bigint,jsonb) from public,anon;
grant execute on function public.imp_steps(uuid,bigint,jsonb) to authenticated;
-- Short, read-only position snapshots avoid taking the game lock for every frame update.
create or replace function public.imp_nearby(game_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'x',q.x,'y',q.y,'room',case when p.body then p.corpse_room else p.room end,
 'body',p.body,'alive',p.alive,'suit',p.suit,'hat',p.hat,'rev',p.move_rev,'at',extract(epoch from p.walked_at)*1000)), '[]'::jsonb)
 from private.imp_games z join private.imp_seats me on me.game=z.id and me.uid=auth.uid() and me.joined
 join private.imp_seats p on p.game=z.id and p.joined cross join lateral(values(
 case when p.body then coalesce(p.bx,p.x) else p.x end,case when p.body then coalesce(p.by,p.y) else p.y end)) q(x,y)
 where z.id=game_id and z.phase='play' and (p.alive or p.body or not me.alive)
 and private.imp_visible(z.map,me.x,me.y,q.x,q.y,case when z.lights_out and me.role='Innocent' then 17 else 49 end)
$$;
revoke all on function public.imp_nearby(uuid) from public,anon;
grant execute on function public.imp_nearby(uuid) to authenticated;
create or replace function public.imp_action(game_id uuid,act text,arg text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare z private.imp_games;s private.imp_seats;t private.imp_seats;edge int[];ok boolean:=false;n int;target uuid;players jsonb;progress int;total int;
begin
 select * into z from private.imp_games where id=game_id for update;
 if not found or auth.uid() is null then raise exception 'Match unavailable';end if;
 if act='join' then
  if z.phase<>'lobby' or not private.imp_can_join(game_id) then raise exception 'Lobby unavailable';end if;
  if (select count(*) from private.imp_seats where game=game_id and joined)>=12 and not exists(select 1 from private.imp_seats where game=game_id and uid=auth.uid() and joined) then raise exception 'Match is full';end if;
  insert into private.imp_seats(game,uid,joined) values(game_id,auth.uid(),true) on conflict(game,uid) do update set joined=true;
 end if;
 select * into s from private.imp_seats where game=game_id and uid=auth.uid();
 if not found then raise exception 'Join the lobby first';end if;
 if not s.joined then raise exception 'Join this lobby first';end if;
 if z.phase='meeting' and now()>=z.deadline then perform private.imp_resolve(game_id);select * into z from private.imp_games where id=game_id;end if;
 if act='read' or act='join' then null;
 elsif act='cosmetic' then
  if z.phase<>'lobby' or coalesce((arg::jsonb->>'suit')::int between 0 and 11 and (arg::jsonb->>'hat') in('none','antenna','cap','sprout','horn'),false) is not true then raise exception 'Choose a lobby color and hat';end if;
  if exists(select 1 from private.imp_seats p where p.game=game_id and p.joined and p.uid<>s.uid and p.suit=(arg::jsonb->>'suit')::int) then raise exception 'That color is already taken';end if;
  update private.imp_seats set suit=(arg::jsonb->>'suit')::int,hat=arg::jsonb->>'hat' where game=game_id and uid=s.uid;
 elsif act='configure' then
  if z.host<>s.uid or z.phase<>'lobby' then raise exception 'Only the lobby host can change settings';end if;
  if arg::jsonb->>'map' not in ('Keel',z.map) then raise exception 'Choose Keel for the feedback build';end if;
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
  case act when 'move' then raise exception 'Update Cove to walk through this match';
  when 'task' then
   if z.lights_out then raise exception 'Restore power in Electrical first';end if;
   if s.room<0 or (s.x-(private.imp_layout(z.map)->s.room->>0)::real)^2+
     (s.y-((private.imp_layout(z.map)->s.room->>1)::real-(private.imp_layout(z.map)->s.room->>3)::real*.24))^2>144 then raise exception 'Approach the marked console';end if;
   if s.role<>'Innocent' or not s.room=any(s.todo) or s.room=any(s.done) or s.last_move>now()-interval '1 second' then raise exception 'Task unavailable';end if;
   update private.imp_seats set done=array_append(done,s.room) where game=game_id and uid=s.uid;
   perform private.imp_check(game_id);
  when 'kill' then
   select * into t from private.imp_seats where game=game_id and uid=arg::uuid;
   if not found or not s.alive or s.role<>'Imposter' or s.next_kill>now() or not t.joined or not t.alive or t.role<>'Innocent' or t.room<>s.room or not private.imp_visible(z.map,s.x,s.y,t.x,t.y,13) or t.arrive_at>now() then raise exception 'Target unavailable or cooldown active';end if;
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
   if act='report' and not exists(select 1 from private.imp_seats where game=game_id and corpse_room=s.room and body and private.imp_visible(z.map,s.x,s.y,coalesce(bx,x),coalesce(by,y),15)) then raise exception 'No body here';end if;
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
 select jsonb_agg(jsonb_build_object('uid',p.uid,'joined',p.joined,'suit',p.suit,'hat',p.hat,'move_rev',p.move_rev,
 'alive',case when z.phase in('meeting','finished') or visible or p.uid=s.uid then p.alive end,
 'room',case when visible and p.body then p.corpse_room when visible or p.uid=s.uid then p.room end,
 'x',case when visible or p.uid=s.uid then tx end,'y',case when visible or p.uid=s.uid then ty end,
 'body',p.body and visible,'role',case when z.phase='finished' or s.role='Imposter' and p.role='Imposter' or p.uid=s.uid then p.role end) order by p.uid)
 into players from private.imp_seats p
 cross join lateral(values(case when p.body then coalesce(p.bx,p.x) else p.x end,case when p.body then coalesce(p.by,p.y) else p.y end)) pos(tx,ty)
 cross join lateral(values((p.alive or p.body) and z.phase='play' and private.imp_visible(z.map,s.x,s.y,tx,ty,case when z.lights_out and s.role='Innocent' then 17 else 49 end))) v(visible)
 where p.game=game_id and (p.joined or z.phase='lobby');
 select coalesce(sum(cardinality(done)),0),coalesce(sum(cardinality(todo)),0) into progress,total from private.imp_seats where game=game_id and role='Innocent';
 return jsonb_build_object('game',to_jsonb(z)-'chat','me',to_jsonb(s),'players',players,'progress',progress,'total',total,'chat',case when z.phase='meeting' then z.chat else '[]'::jsonb end);
end $$;
create or replace function private.imp_locate() returns trigger language plpgsql set search_path='' as $$
declare r jsonb;slot int;
begin
 if new.body and not old.body then new.bx:=old.x;new.by:=old.y;end if;
 if new.role is not null and old.role is null or new.room<>old.room and new.x is not distinct from old.x and new.y is not distinct from old.y and new.room>=0 then
  select private.imp_layout(map)->new.room into r from private.imp_games where id=new.game;
  slot:=get_byte(uuid_send(new.uid),15);new.x:=(r->>0)::real+(slot%5-2)*3;new.y:=(r->>1)::real+(slot/5%3-1)*3;
 new.move_rev:=old.move_rev+1;new.move_credit:=12;new.walked_at:=clock_timestamp();
 end if;return new;
end $$;

commit;
