-- Run after upgrade-imposter-ship-lobby.sql; preserve v2 RPCs for older clients.
begin;
alter table private.imp_games
 add column if not exists vent_cooldown int not null default 15,
 add column if not exists lights_epoch bigint not null default 0;
alter table private.imp_seats
 add column if not exists vent_node int,
 add column if not exists vent_ready_at timestamptz,
 add column if not exists repair_order int[],
 add column if not exists repair_token uuid,
 add column if not exists move_epoch bigint not null default 0;

-- Collision mask for the original 3D shuttle, not Keel's larger cafe.
create or replace function private.imp_3d_lobby_clear(px real,py real)
returns boolean language plpgsql immutable set search_path='' as $$
declare d record;obj record;x real;y real;
begin
 for d in select * from (values (0::real,0::real),(2,0),(-2,0),(0,2),(0,-2)) offsets(dx,dy) loop
  x:=px+d.dx;y:=py+d.dy;
  if abs(x-350)>52 or abs(y-94)>50 or abs(x-350)+abs(y-94)>97 then return false;end if;
  for obj in select * from (values
   (320::real,72::real,10::real,6::real),(324,118,12,11),(379,111,12,11),
   (308,53,6,6),(318,53,6,6),(328,53,6,6),(372,53,6,6),(382,53,6,6),(392,53,6,6),
   (380,72,14,6),(318,82,40,1),(382,82,40,1),(338,88,1,12),(362,88,1,12)
  ) furniture(cx,cy,w,h) loop
   if abs(x-obj.cx)<obj.w/2 and abs(y-obj.cy)<obj.h/2 then return false;end if;
  end loop;
 end loop;
 return true;
end $$;
revoke all on function private.imp_3d_lobby_clear(real,real) from public,anon,authenticated;


-- The legacy 3D client has a single independent shuttle at (350,94),
-- regardless of the round map. Do not change the v2 lobby respawn behavior:
-- older 2D clients still use their selected map's room 0.
create or replace function private.imp_3d_ensure_shuttle(game_id uuid,seat_user uuid)
returns void language plpgsql security definer set search_path='' as $
declare slot int;
begin
 if seat_user is null then return;end if;
 slot:=get_byte(uuid_send(seat_user),15);
 update private.imp_seats s
 set x=350+(slot%5-2)*3,y=94+((slot/5)%3-1)*3,room=0,
     move_rev=move_rev+1,move_epoch=move_epoch+1,
     move_credit=12,walked_at=clock_timestamp()
 where s.game=game_id and s.uid=seat_user and s.joined
   and exists(select 1 from private.imp_games g where g.id=game_id and g.phase='lobby')
   and (s.x is null or s.y is null
        or abs(s.x-350)>52 or abs(s.y-94)>50
        or abs(s.x-350)+abs(s.y-94)>97);
end $;
revoke all on function private.imp_3d_ensure_shuttle(uuid,uuid)
 from public,anon,authenticated;

-- The creator must be placed inside the same walkable shuttle as joiners.
create or replace function public.imp_create_3d(
 map_name text,imposters int,cooldown int,task_count int,vote_seconds int,
 lobby_name text,meeting_cooldown_seconds int
) returns uuid language plpgsql security definer set search_path='' as $
declare new_game uuid;
begin
 new_game:=public.imp_create_v2(map_name,imposters,cooldown,task_count,
  vote_seconds,lobby_name,meeting_cooldown_seconds);
 perform private.imp_3d_ensure_shuttle(new_game,auth.uid());
 return new_game;
end $;
revoke all on function public.imp_create_3d(text,int,int,int,int,text,int)
 from public,anon;
grant execute on function public.imp_create_3d(text,int,int,int,int,text,int)
 to authenticated;

create or replace function public.imp_steps_3d(game_id uuid,revision bigint,steps jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
<<batch>>
declare g private.imp_games;s private.imp_seats;v jsonb;dx real;dy real;distance real;
 credit real;x real;y real;stamp timestamptz;
begin
 select * into g from private.imp_games where id=game_id for share;
 if not found then raise exception 'Match unavailable';end if;
 if g.phase='play' then
  if exists(select 1 from private.imp_seats where game=game_id and uid=auth.uid() and vent_node is not null)
   then raise exception 'Exit the vent before walking';end if;
  return public.imp_steps_v2(game_id,revision,steps);
 end if;
 select * into s from private.imp_seats where game=game_id and uid=auth.uid() and joined for update;
 if not found or g.phase<>'lobby' then raise exception 'Match unavailable';end if;
 if jsonb_typeof(steps) is distinct from 'array' or jsonb_array_length(steps) not between 1 and 48
  then raise exception 'Invalid steps';end if;
 if revision=s.move_rev then
  stamp:=clock_timestamp();credit:=least(39,s.move_credit+29*greatest(0,extract(epoch from stamp-coalesce(s.walked_at,stamp))));
  x:=s.x;y:=s.y;
  for v in select value from jsonb_array_elements(steps) loop
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>2 or jsonb_typeof(v->0)<>'number' or jsonb_typeof(v->1)<>'number'
    then raise exception 'Invalid step';end if;
   dx:=(v->>0)::real;dy:=(v->>1)::real;distance:=sqrt(dx*dx+dy*dy);
   if distance>1.31 then raise exception 'Invalid step length';end if;
   if distance>credit then return jsonb_build_object('x',s.x,'y',s.y,'revision',s.move_rev);end if;
   if private.imp_3d_lobby_clear(x+dx,y) then x:=x+dx;end if;
   if private.imp_3d_lobby_clear(x,y+dy) then y:=y+dy;end if;
   credit:=credit-distance;
  end loop;
  update private.imp_seats p
   set x=batch.x,y=batch.y,room=0,walked_at=stamp,move_credit=credit,move_rev=p.move_rev+1
   where p.game=game_id and p.uid=s.uid returning * into s;
 end if;
 return jsonb_build_object('x',s.x,'y',s.y,'revision',s.move_rev);
end $$;
revoke all on function public.imp_steps_3d(uuid,bigint,jsonb) from public,anon;
grant execute on function public.imp_steps_3d(uuid,bigint,jsonb) to authenticated;

create or replace function public.imp_3d_action(game_id uuid,act text,arg text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.imp_games;s private.imp_seats;v jsonb;
 selected_color int;selected_hat text;vent int;destination int;dest_x real;dest_y real;dest_room int;
 wires jsonb;idx int;right_idx int;result jsonb;cooldown_input int;target_map text;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into g from private.imp_games where id=game_id for update;
 if not found then raise exception 'Match unavailable';end if;
 if act='join' then
  result:=public.imp_action_v2(game_id,act,arg);
  perform private.imp_3d_ensure_shuttle(game_id,auth.uid());
  return public.imp_action_v2(game_id,'read','');
 end if;
 if act='read' then
  -- v2 housekeeping may have just finished a round and teleported players
  -- to map room 0. Normalize only this 3D caller back into the shuttle.
  result:=public.imp_action_v2(game_id,'read','');
  perform private.imp_3d_ensure_shuttle(game_id,auth.uid());
  return public.imp_action_v2(game_id,'read','');
 end if;
 select * into s from private.imp_seats where game=game_id and uid=auth.uid() and joined for update;
 if not found then raise exception 'Join this lobby first';end if;
 if act='cosmetic' then
  v:=arg::jsonb;selected_color:=(v->>'suit')::int;selected_hat:=v->>'hat';
  if g.phase<>'lobby' or selected_color not between 0 and 11 or selected_hat not in
    ('none','antenna','cap','sprout','horn','banana','crown','bunny','cat','eggs','cowboy','balloon','mini','halo','paper')
    then raise exception 'Invalid suit or hat';end if;
  if exists(select 1 from private.imp_seats p where p.game=game_id and p.uid<>s.uid and p.joined and p.suit=selected_color)
    then raise exception 'That color is already taken';end if;
  update private.imp_seats set suit=selected_color,hat=selected_hat where game=game_id and uid=s.uid;
  return public.imp_action_v2(game_id,'read','');
 elsif act='configure' then
  if g.phase<>'lobby' or g.host<>s.uid then raise exception 'Only the host can change settings';end if;
  v:=arg::jsonb;
  target_map:=v->>'map';
  cooldown_input:=coalesce((v->>'vent_cooldown')::int,g.vent_cooldown);
  if target_map is null or target_map not in ('Keel','Caldera','Frostline')
    then raise exception 'Choose an available 3D map';end if;
  if cooldown_input not between 0 and 90 then raise exception 'Invalid vent cooldown';end if;
  -- The older base configure function is intentionally Keel-only. Reuse its
  -- other host-only validation with the current map, then safely apply the
  -- selected original 3D map while the lobby is still waiting.
  result:=public.imp_action_v2(game_id,'configure',(v||jsonb_build_object('map',g.map))::text);
  update private.imp_games set map=target_map,vent_cooldown=cooldown_input where id=game_id;
  return public.imp_action_v2(game_id,'read','');
 elsif act='repair_begin' then
  if g.phase<>'play' or not s.alive or not g.lights_out
   or s.room<>(case g.map when 'Keel' then 5 when 'Caldera' then 3 else 2 end)
   or s.vent_node is not null
    then raise exception 'Cannot repair power here';end if;
  update private.imp_seats set repair_token=gen_random_uuid(),
    repair_order=(select array_agg(i order by random()) from generate_series(0,3) i)
    where game=game_id and uid=s.uid;
  return public.imp_action_v2(game_id,'read','');
 elsif act='repair' then
  v:=arg::jsonb;wires:=v->'connections';
  if g.phase<>'play' or not g.lights_out or s.vent_node is not null or s.repair_token is null
   or v->>'token' is distinct from s.repair_token::text or jsonb_typeof(wires) is distinct from 'array'
   or jsonb_array_length(wires)<>4 then raise exception 'Invalid repair attempt';end if;
  for idx in 0..3 loop
   right_idx:=(wires->>idx)::int;
   if right_idx not between 0 and 3 or s.repair_order[right_idx+1] is distinct from idx
    then raise exception 'Connect matching wires first';end if;
  end loop;
  result:=public.imp_action_v2(game_id,'repair','');
  update private.imp_seats set repair_token=null,repair_order=null where game=game_id and uid=s.uid;
  update private.imp_games set lights_epoch=lights_epoch+1 where id=game_id;
  return public.imp_action_v2(game_id,'read','');
 elsif act in ('vent_enter','vent_travel','vent_exit') then
  if g.phase<>'play' or g.map<>'Keel' or not s.alive or s.role<>'Imposter'
    then raise exception 'Vent unavailable';end if;
  if act='vent_enter' then
   if s.vent_node is not null or coalesce(s.vent_ready_at,now()-interval '1 second')>now()
    then raise exception 'Vent cooldown active';end if;
   vent:=arg::int;
   if vent not between 0 and 3 then raise exception 'Invalid vent';end if;
   dest_x:=(array[150,198,382,665])[vent+1];dest_y:=(array[112,311,275,179])[vent+1];
   if sqrt((s.x-dest_x)^2+(s.y-dest_y)^2)>9 then raise exception 'Approach the vent first';end if;
   update private.imp_seats set vent_node=vent where game=game_id and uid=s.uid;
  elsif act='vent_travel' then
   if s.vent_node is null then raise exception 'Enter a vent first';end if;
   destination:=arg::int;
   if destination not between 0 and 3 or (destination+4-s.vent_node)%4 not in (1,3)
    then raise exception 'Invalid vent connection';end if;
   update private.imp_seats set vent_node=destination where game=game_id and uid=s.uid;
  else
   if s.vent_node is null then raise exception 'Not in a vent';end if;
   destination:=s.vent_node;
   dest_x:=(array[150,198,382,665])[destination+1];dest_y:=(array[112,311,275,179])[destination+1];
   dest_room:=(array[1,5,3,8])[destination+1];
   update private.imp_seats set vent_node=null,vent_ready_at=now()+make_interval(secs=>g.vent_cooldown),
     x=dest_x,y=dest_y,room=dest_room,move_rev=move_rev+1,move_epoch=move_epoch+1,move_credit=12,walked_at=clock_timestamp()
    where game=game_id and uid=s.uid;
  end if;
  return public.imp_action_v2(game_id,'read','');
 end if;
 if s.vent_node is not null and act not in ('read','say','vote')
  then raise exception 'Exit vent before performing that action';end if;
 result:=public.imp_action_v2(game_id,act,arg);
 if act='sabotage' then
  update private.imp_games set lights_epoch=lights_epoch+1 where id=game_id;
  result:=public.imp_action_v2(game_id,'read','');
 end if;
 if act='start' or result->'game'->>'phase' in ('meeting','lobby','finished') then
  update private.imp_seats set vent_node=null where game=game_id and vent_node is not null;
 end if;
 return result;
end $$;
revoke all on function public.imp_3d_action(uuid,text,text) from public,anon;
grant execute on function public.imp_3d_action(uuid,text,text) to authenticated;

-- Vented players must not leak through nearby position snapshots.
create or replace function public.imp_nearby(game_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'x',q.x,'y',q.y,'room',case when p.body then p.corpse_room else p.room end,
 'body',p.body,'alive',p.alive,'suit',p.suit,'hat',p.hat,'rev',p.move_rev,'epoch',p.move_epoch,'at',extract(epoch from p.walked_at)*1000)), '[]'::jsonb)
 from private.imp_games z join private.imp_seats me on me.game=z.id and me.uid=auth.uid() and me.joined
 join private.imp_seats p on p.game=z.id and p.joined cross join lateral(values(
 case when p.body then coalesce(p.bx,p.x) else p.x end,case when p.body then coalesce(p.by,p.y) else p.y end)) q(x,y)
 where z.id=game_id and z.phase in ('lobby','play') and (z.phase='lobby' or p.alive or p.body or not me.alive)
 and (z.phase='lobby' or p.vent_node is null)
 and (z.phase='lobby' or private.imp_visible(z.map,me.x,me.y,q.x,q.y,case when z.lights_out and me.role='Innocent' then 17 else 49 end))
$$;
revoke all on function public.imp_nearby(uuid) from public,anon;
grant execute on function public.imp_nearby(uuid) to authenticated;
commit;
