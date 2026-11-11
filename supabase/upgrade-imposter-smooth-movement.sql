-- Introduce backward-compatible v2 movement reconciliation under latency.
-- Keep public.imp_steps unchanged for older Cove installations.
-- Run once after upgrade-keel-feedback.sql on existing installations.
begin;
create or replace function public.imp_steps_v2(game_id uuid,revision bigint,steps jsonb) returns jsonb
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
end $;
revoke all on function public.imp_steps_v2(uuid,bigint,jsonb) from public,anon;
grant execute on function public.imp_steps_v2(uuid,bigint,jsonb) to authenticated;
commit;
