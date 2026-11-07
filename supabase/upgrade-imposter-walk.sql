begin;
alter table private.imp_seats add column if not exists x real,add column if not exists y real,
 add column if not exists bx real,add column if not exists by real,add column if not exists walked_at timestamptz;
create or replace function private.imp_layout(m text) returns jsonb language sql immutable as $$
 select ('{"Keel":[[350,94,134,78],[125,95,95,63],[535,100,89,58],[354,255,98,84],[70,203,91,70],[166,297,106,65],[490,317,89,63],[541,218,92,64],[642,165,82,59]],"Caldera":[[75,249,100,94],[180,260,88,62],[246,349,101,56],[285,163,101,65],[384,252,99,62],[386,91,105,66],[503,98,94,60],[597,189,105,76],[566,308,112,63]],"Frostline":[[339,58,95,62],[337,145,118,56],[148,148,115,72],[511,132,115,60],[350,245,110,67],[505,232,100,52],[601,312,102,68],[421,350,102,58],[177,307,111,76]]}'::jsonb)->m
$$;
create or replace function private.imp_surface(m text,x double precision,y double precision,furniture boolean) returns int language plpgsql immutable set search_path='' as $$
declare layout jsonb:=private.imp_layout(m);r jsonb;a jsonb;b jsonb;i int;edge int[];dx real;dy real;f real;w real;h real;
begin
 for i in 0..8 loop
  r:=layout->i;dx:=abs(x-(r->>0)::real);dy:=abs(y-(r->>1)::real);w:=(r->>2)::real/2;h:=(r->>3)::real/2;
  if dx<=w and dy<=h and dx+dy<=w+h-5 then
   if furniture and i=0 and ((dx-w*.52)/(w*.186))^2+((y-(r->>1)::real-h*.36)/(h*.15))^2<1 then return -2;end if;
   return i;end if;
 end loop;
 foreach edge slice 1 in array private.imp_edges(m) loop
  a:=layout->edge[1];b:=layout->edge[2];dx:=(b->>0)::real-(a->>0)::real;dy:=(b->>1)::real-(a->>1)::real;
  f:=greatest(0,least(1,((x-(a->>0)::real)*dx+(y-(a->>1)::real)*dy)/(dx*dx+dy*dy)));
  if (x-(a->>0)::real-f*dx)^2+(y-(a->>1)::real-f*dy)^2<=121 then return -1;end if;
 end loop;return -2;
end $$;
create or replace function private.imp_floor(m text,x double precision,y double precision) returns int
language sql immutable set search_path='' as $$select private.imp_surface(m,x,y,true)$$;
revoke all on function private.imp_surface(text,double precision,double precision,boolean) from public,anon,authenticated;
create or replace function private.imp_visible(m text,x real,y real,tx real,ty real,reach integer) returns boolean
language plpgsql immutable set search_path='' as $$
declare d real:=sqrt((tx-x)^2+(ty-y)^2);i int;n int;
begin
 if d is null or d>reach then return false;end if;
 n:=greatest(1,ceil(d/2)::int);
 for i in 1..n loop
  if private.imp_surface(m,x+(tx-x)*i/n,y+(ty-y)*i/n,false)=-2 then return false;end if;
 end loop;return true;
end $$;
revoke all on function private.imp_visible(text,real,real,real,real,integer) from public,anon,authenticated;
create or replace function public.imp_walk(game_id uuid,px real,py real) returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.imp_games;s private.imp_seats;r jsonb;dist real;n int;i int;qx real;qy real;room_id int;ok boolean:=true;
begin
 select * into g from private.imp_games where id=game_id for share;
 select * into s from private.imp_seats where game=game_id and uid=auth.uid() and joined for update;
 if not found or g.phase<>'play' then raise exception 'Match unavailable';end if;
 r:=private.imp_layout(g.map)->greatest(s.room,0);s.x:=coalesce(s.x,(r->>0)::real);s.y:=coalesce(s.y,(r->>1)::real);
 if px is null or py is null or px not between 0 and 710 or py not between 0 and 410 then raise exception 'Invalid position';end if;
 dist:=sqrt((px-s.x)^2+(py-s.y)^2);
 if dist>least(38,.02+29*extract(epoch from (clock_timestamp()-coalesce(s.walked_at,now()-interval '1 second')))) then ok:=false;
 else
  n:=greatest(1,ceil(dist/1.5)::int);
  for i in 1..n loop
   qx:=s.x+(px-s.x)*i/n;qy:=s.y+(py-s.y)*i/n;
   if -2 in(private.imp_floor(g.map,qx,qy),private.imp_floor(g.map,qx+2,qy),private.imp_floor(g.map,qx-2,qy),private.imp_floor(g.map,qx,qy+2),private.imp_floor(g.map,qx,qy-2)) then ok:=false;exit;end if;
  end loop;
 end if;
 if ok and dist>0 then room_id:=private.imp_floor(g.map,px,py);
  update private.imp_seats set x=px,y=py,room=room_id,walked_at=clock_timestamp(),last_move=case when room<>room_id then now() else last_move end
   where game=game_id and uid=s.uid;s.x:=px;s.y:=py;
 end if;
 return jsonb_build_object('x',s.x,'y',s.y);
end $$;
create or replace function private.imp_locate() returns trigger language plpgsql set search_path='' as $$
declare r jsonb;slot int;
begin
 if new.body and not old.body then new.bx:=old.x;new.by:=old.y;end if;
 if new.role is not null and old.role is null or new.room<>old.room and new.x is not distinct from old.x and new.y is not distinct from old.y and new.room>=0 then
  select private.imp_layout(map)->new.room into r from private.imp_games where id=new.game;
  slot:=get_byte(uuid_send(new.uid),15);new.x:=(r->>0)::real+(slot%5-2)*3;new.y:=(r->>1)::real+(slot/5%3-1)*3;
 end if;return new;
end $$;
drop trigger if exists imp_locate on private.imp_seats;
create trigger imp_locate before update on private.imp_seats for each row execute function private.imp_locate();
update private.imp_seats s set x=(private.imp_layout(g.map)->greatest(s.room,0)->>0)::real,y=(private.imp_layout(g.map)->greatest(s.room,0)->>1)::real from private.imp_games g where s.game=g.id and s.x is null;
revoke all on function private.imp_layout(text),private.imp_floor(text,double precision,double precision),private.imp_locate() from public,anon,authenticated;
revoke all on function public.imp_walk(uuid,real,real) from public,anon;
grant execute on function public.imp_walk(uuid,real,real) to authenticated;
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
   if not found or not s.alive or s.role<>'Imposter' or s.next_kill>now() or not t.joined or not t.alive or t.role<>'Innocent' or t.room<>s.room or ((t.x-s.x)^2+(t.y-s.y)^2)>180 or t.arrive_at>now() then raise exception 'Target unavailable or cooldown active';end if;
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
   if act='report' and not exists(select 1 from private.imp_seats where game=game_id and corpse_room=s.room and body and (coalesce(bx,x)-s.x)^2+(coalesce(by,y)-s.y)^2<=225) then raise exception 'No body here';end if;
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
 select jsonb_agg(jsonb_build_object('uid',p.uid,'joined',p.joined,
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
create or replace function public.imp_create(map_name text,imposters int,cooldown int,task_count int,vote_seconds int) returns uuid language plpgsql security definer set search_path='' as $$
declare g uuid;
begin
 if auth.uid() is null or map_name<>'Keel' or imposters not between 1 and 3 or cooldown not between 5 and 90 or task_count not between 1 and 5 or vote_seconds not between 15 and 120 then raise exception 'Invalid match settings';end if;
 insert into private.imp_games(host,map,imposters,cooldown,tasks,vote_seconds) values(auth.uid(),map_name,imposters,cooldown,task_count,vote_seconds) returning id into g;
 insert into private.imp_seats(game,uid,joined) values(g,auth.uid(),true);
 return g;
end $$;
commit;
