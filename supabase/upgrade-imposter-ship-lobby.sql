-- Restore a walkable ship lobby without affecting live-match movement.
-- Apply AFTER upgrade-imposter-lobby-controls.sql; never re-run historical upgrades.
-- The established v2 RPC name is retained for old game clients.
begin;

-- Spawn new lobby participants in the ship, including the lobby host.
create or replace function private.imp_lobby_place() returns trigger
language plpgsql set search_path='' as $$
declare center jsonb;slot int;
begin
 if new.joined and (new.x is null or new.y is null) then
  select private.imp_layout(g.map)->0 into center
   from private.imp_games g where g.id=new.game;
  if center is null then raise exception 'Lobby map unavailable';end if;
  slot:=get_byte(uuid_send(new.uid),15);
  new.x:=(center->>0)::real+(slot%5-2)*3;
  new.y:=(center->>1)::real+(slot/5%3-1)*3;
  new.room:=0;
  new.move_rev:=coalesce(new.move_rev,0);
  new.move_credit:=12;
  new.walked_at:=clock_timestamp();
 end if;
 return new;
end $$;
drop trigger if exists imp_lobby_place on private.imp_seats;
create trigger imp_lobby_place before insert or update of joined on private.imp_seats
 for each row execute function private.imp_lobby_place();
revoke all on function private.imp_lobby_place() from public,anon,authenticated;

-- Repair seats created while the lobby was a static GUI.
update private.imp_seats s
 set x=(private.imp_layout(g.map)->0->>0)::real,
     y=(private.imp_layout(g.map)->0->>1)::real,
     room=0,move_credit=12,walked_at=clock_timestamp()
 from private.imp_games g
 where s.game=g.id and s.joined and (s.x is null or s.y is null);

-- Permit authoritative, collision-checked walking in both lobby and round.
create or replace function public.imp_steps_v2(game_id uuid,revision bigint,steps jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<step_batch>>
declare z private.imp_games;s private.imp_seats;v jsonb;dx real;dy real;dist real;credit real;x real;y real;room_id int;stamp timestamptz;
begin
 select * into z from private.imp_games where id=game_id for share;
 select * into s from private.imp_seats where game=game_id and uid=auth.uid() and joined for update;
 if not found or z.phase not in ('lobby','play') then raise exception 'Match unavailable';end if;
 if jsonb_typeof(steps) is distinct from 'array' or jsonb_array_length(steps) not between 1 and 48 then raise exception 'Invalid steps';end if;
 if revision=s.move_rev then
  stamp:=clock_timestamp();credit:=least(39,s.move_credit+29*greatest(0,extract(epoch from stamp-coalesce(s.walked_at,stamp))));
  x:=s.x;y:=s.y;
  for v in select value from jsonb_array_elements(steps) loop
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>2 or jsonb_typeof(v->0)<>'number' or jsonb_typeof(v->1)<>'number' then raise exception 'Invalid step';end if;
   dx:=(v->>0)::real;dy:=(v->>1)::real;dist:=sqrt(dx*dx+dy*dy);
   if dist>1.31 then raise exception 'Invalid step length';end if;
   if dist>credit then
    -- Nothing is committed until the whole batch fits in the movement budget.
    -- Returning an unchanged revision tells the client to retry rather than
    -- throwing away locally predicted input frames.
    return jsonb_build_object('x',s.x,'y',s.y,'revision',s.move_rev);
   end if;
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
revoke all on function public.imp_steps_v2(uuid,bigint,jsonb) from public,anon;
grant execute on function public.imp_steps_v2(uuid,bigint,jsonb) to authenticated;

-- The existing scene uses this lightweight RPC to animate lobby players.
create or replace function public.imp_nearby(game_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'x',q.x,'y',q.y,'room',case when p.body then p.corpse_room else p.room end,
 'body',p.body,'alive',p.alive,'suit',p.suit,'hat',p.hat,'rev',p.move_rev,'at',extract(epoch from p.walked_at)*1000)), '[]'::jsonb)
 from private.imp_games z join private.imp_seats me on me.game=z.id and me.uid=auth.uid() and me.joined
 join private.imp_seats p on p.game=z.id and p.joined cross join lateral(values(
 case when p.body then coalesce(p.bx,p.x) else p.x end,case when p.body then coalesce(p.by,p.y) else p.y end)) q(x,y)
 where z.id=game_id and z.phase in ('lobby','play') and (z.phase='lobby' or p.alive or p.body or not me.alive)
 and (z.phase='lobby' or private.imp_visible(z.map,me.x,me.y,q.x,q.y,case when z.lights_out and me.role='Innocent' then 17 else 49 end))
$$;
revoke all on function public.imp_nearby(uuid) from public,anon;
grant execute on function public.imp_nearby(uuid) to authenticated;

commit;
