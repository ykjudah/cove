begin;
create or replace function public.live_call_action(device_id uuid,action text,call_id uuid default null,target_room uuid default null,wants_video boolean default true,peer_id uuid default null,description jsonb default null,mic_on boolean default true,camera_on boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();c private.live_calls;m private.live_call_members;other uuid;kind text;total integer;
begin
 if u is null or device_id is null then raise exception 'Sign in required';end if;
 perform pg_advisory_xact_lock(7239143);perform private.clean_live_calls();
 if action='start' then
  if not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
  update private.live_call_members cm set status='left' where cm.user_id=u and cm.status in('joined','invited') and cm.call_id in(select id from private.live_calls where ended_at is null and room_id<>target_room);
  perform private.clean_live_calls();
  select * into c from private.live_calls where room_id=target_room and ended_at is null;
  if c.id is not null and c.video is distinct from wants_video then raise exception 'A different call type is active. Use the matching voice or video button to join';end if;
  if c.id is null then
   if exists(select 1 from private.live_call_members x join private.live_calls y on y.id=x.call_id where x.user_id=u and x.status='joined' and y.ended_at is null) then raise exception 'Finish your other call first';end if;
   if (select count(*) from private.live_calls where creator=u and created_at>now()-interval '1 minute')>=5 then raise exception 'Wait a minute before calling again';end if;
   select r.kind into kind from public.rooms r where id=target_room;
   if kind='dm' and exists(select 1 from public.room_members r where room_id=target_room and private.people_blocked(u,r.user_id)) then raise exception 'Call unavailable';end if;
   if kind='dm' and exists(select 1 from private.live_call_members x join private.live_calls y on y.id=x.call_id where x.status='joined' and y.ended_at is null and x.user_id in(select user_id from public.room_members where room_id=target_room)) then raise exception 'This person is already in a call';end if;
   insert into private.live_calls(id,room_id,creator,video) values(coalesce(call_id,gen_random_uuid()),target_room,u,coalesce(wants_video,true)) returning * into c;
   insert into private.live_call_members(call_id,user_id,status,camera) select c.id,r.user_id,'invited',c.video from public.room_members r where r.room_id=target_room and not private.people_blocked(u,r.user_id);
  end if;
  call_id:=c.id;action:='join';
 else select * into c from private.live_calls where id=call_id;end if;
 if c.id is null or c.ended_at is not null or not private.is_member(c.room_id) then raise exception 'Call ended or unavailable';end if;
 select * into m from private.live_call_members x where x.call_id=c.id and user_id=u;
 if action='join' then
  if exists(select 1 from private.live_call_members x join private.live_calls y on y.id=x.call_id where x.user_id=u and x.status='joined' and y.ended_at is null and (x.call_id<>c.id or x.device_id<>device_id)) then raise exception 'Already in a call on another device';end if;
  if exists(select 1 from private.live_call_members x where x.call_id=c.id and x.status='joined' and private.people_blocked(u,x.user_id)) then raise exception 'Call unavailable';end if;
  
  insert into private.live_call_members as x(call_id,user_id,device_id,status,camera) values(c.id,u,device_id,'joined',c.video) on conflict on constraint live_call_members_pkey do update set device_id=excluded.device_id,status='joined',seen_at=now(),mic=true,camera=c.video,relay_at=null,connection_id=gen_random_uuid();
  update private.live_calls set connected_at=coalesce(connected_at,now()) where id=c.id and (select count(*) from private.live_call_members x where x.call_id=c.id and status='joined')>=2;
 elsif action='leave' then
  if m.status='joined' and m.device_id is distinct from device_id then raise exception 'Call is on another device';end if;
  update private.live_call_members x set status='left' where x.call_id=c.id and x.user_id=u;
  if exists(select 1 from public.rooms where id=c.room_id and rooms.kind='dm') then update private.live_calls set ended_at=now() where id=c.id;end if;
 elsif action='signal' then
  if m.status is distinct from 'joined' or m.device_id is distinct from device_id or peer_id=u or not exists(select 1 from private.live_call_members x where x.call_id=c.id and x.user_id=peer_id and status='joined') or private.people_blocked(u,peer_id) then raise exception 'Peer unavailable';end if;
  if description->>'type' is distinct from (case when u::text<peer_id::text then 'offer' else 'answer' end) or jsonb_typeof(description->'sdp') is distinct from 'string' or coalesce(length(description->>'sdp'),0) not between 10 and 100000 then raise exception 'Invalid signal';end if;
  insert into private.live_call_signals as x(call_id,sender,recipient,description) values(c.id,u,peer_id,jsonb_build_object('type',description->>'type','sdp',description->>'sdp')) on conflict on constraint live_call_signals_pkey do nothing;
 elsif action='media' then
  if m.status is distinct from 'joined' or m.device_id is distinct from device_id then raise exception 'Call unavailable';end if;
  update private.live_call_members x set mic=coalesce(mic_on,false),camera=coalesce(camera_on,false) where x.call_id=c.id and x.user_id=u;
 else raise exception 'Invalid call action';end if;
 perform private.clean_live_calls();return jsonb_build_object('id',c.id);
end $$;
commit;
