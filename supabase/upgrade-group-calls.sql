begin;
create table if not exists private.live_calls(id uuid primary key,room_id uuid not null references public.rooms(id) on delete cascade,creator uuid not null,video boolean not null,created_at timestamptz not null default now(),connected_at timestamptz,ended_at timestamptz);
create table if not exists private.live_call_members(call_id uuid references private.live_calls(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,device_id uuid,status text not null check(status in('invited','joined','left')),seen_at timestamptz not null default now(),mic boolean not null default true,camera boolean not null default true,connection_id uuid not null default gen_random_uuid(),relay_at timestamptz,primary key(call_id,user_id));
create table if not exists private.live_call_signals(call_id uuid references private.live_calls(id) on delete cascade,sender uuid,recipient uuid,description jsonb not null,primary key(call_id,sender,recipient));
revoke all on private.live_calls,private.live_call_members,private.live_call_signals from public,anon,authenticated;
create unique index if not exists live_call_room on private.live_calls(room_id) where ended_at is null;
create or replace function private.clean_live_calls() returns void language plpgsql security definer set search_path='' as $$begin
 update private.live_call_members set status='left' where status='joined' and seen_at<now()-interval '60 seconds';
 update private.live_call_members m set status='left' where status='invited' and exists(select 1 from private.live_calls c where c.id=m.call_id and c.created_at<now()-interval '20 seconds');
 update private.live_calls c set ended_at=now() where ended_at is null and (created_at<now()-interval '2 hours' or not exists(select 1 from private.live_call_members m where m.call_id=c.id and m.status='joined') or (connected_at is not null and exists(select 1 from public.rooms where id=c.room_id and kind='dm') and (select count(*) from private.live_call_members m where m.call_id=c.id and m.status='joined')<2));
 delete from private.live_call_signals s where exists(select 1 from private.live_calls c where c.id=s.call_id and c.ended_at is not null) or exists(select 1 from private.live_call_members m where m.call_id=s.call_id and m.user_id in(s.sender,s.recipient) and m.status<>'joined');
 delete from private.live_calls where created_at<now()-interval '1 day';
end $$;
create or replace function public.live_call_action(device_id uuid,action text,call_id uuid default null,target_room uuid default null,wants_video boolean default true,peer_id uuid default null,description jsonb default null,mic_on boolean default true,camera_on boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();c private.live_calls;m private.live_call_members;other uuid;kind text;total integer;
begin
 if u is null or device_id is null then raise exception 'Sign in required';end if;
 perform pg_advisory_xact_lock(7239143);perform private.clean_live_calls();
 if action='start' then
  if not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
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
create or replace function public.poll_live_calls(device_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();c private.live_calls;m private.live_call_members;
begin
 if u is null or device_id is null then raise exception 'Sign in required';end if;
 perform private.clean_live_calls();
 -- Leaving the room or blocking a participant immediately cuts signaling access.
 update private.live_call_members x set status='left' from private.live_calls y where x.call_id=y.id and y.ended_at is null and x.user_id=u and (not private.is_member(y.room_id) or exists(select 1 from private.live_call_members z where z.call_id=y.id and z.status='joined' and private.people_blocked(u,z.user_id)));
 select y.* into c from private.live_calls y join private.live_call_members x on x.call_id=y.id where y.ended_at is null and x.user_id=u and (x.status='invited' or(x.status='joined' and x.device_id=device_id)) and private.is_member(y.room_id) order by (x.status='joined') desc,y.created_at desc limit 1;
 if c.id is null then return null;end if;
 select * into m from private.live_call_members x where x.call_id=c.id and x.user_id=u;
 if m.status='joined' then update private.live_call_members x set seen_at=now() where x.call_id=c.id and user_id=u;end if;
 return to_jsonb(c)||jsonb_build_object('self_status',m.status,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',x.user_id,'connection',x.connection_id,'status',x.status,'mic',x.mic,'camera',x.camera)),'[]'::jsonb) from private.live_call_members x where x.call_id=c.id and x.status<>'left'),'signals',case when m.status='joined' then(select coalesce(jsonb_agg(jsonb_build_object('sender',s.sender,'description',s.description)),'[]'::jsonb) from private.live_call_signals s where s.call_id=c.id and s.recipient=u) else '[]'::jsonb end,'group',exists(select 1 from public.rooms where id=c.room_id and kind='group'));
end $$;
create or replace function public.authorize_live_call_relay(call_id uuid,device_id uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
perform private.clean_live_calls();
update private.live_call_members x set relay_at=now() from private.live_calls c where x.call_id=authorize_live_call_relay.call_id and c.id=x.call_id and c.ended_at is null and x.user_id=auth.uid() and x.device_id=authorize_live_call_relay.device_id and x.status='joined' and private.is_member(c.room_id) and exists(select 1 from private.live_call_members y where y.call_id=c.id and y.user_id<>x.user_id and y.status='joined') and not exists(select 1 from private.live_call_members y where y.call_id=c.id and y.status='joined' and private.people_blocked(x.user_id,y.user_id)) and (x.relay_at is null or x.relay_at<now()-interval '1 minute');return found;end $$;
revoke all on function private.clean_live_calls() from public,anon,authenticated;
revoke all on function public.live_call_action(uuid,text,uuid,uuid,boolean,uuid,jsonb,boolean,boolean),public.poll_live_calls(uuid),public.authorize_live_call_relay(uuid,uuid) from public,anon;
grant execute on function public.live_call_action(uuid,text,uuid,uuid,boolean,uuid,jsonb,boolean,boolean),public.poll_live_calls(uuid),public.authorize_live_call_relay(uuid,uuid) to authenticated;
drop trigger if exists activity_audit on private.live_calls;create trigger activity_audit after insert or update on private.live_calls for each row execute function private.audit_activity();
drop trigger if exists activity_audit on private.live_call_members;create trigger activity_audit after insert or update on private.live_call_members for each row execute function private.audit_activity();
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') then
if exists(select 1 from cron.job where jobname='sahur-live-call-cleanup') then perform cron.unschedule('sahur-live-call-cleanup');end if;
perform cron.schedule('sahur-live-call-cleanup','* * * * *','select private.clean_live_calls()');end if;end $$;

-- Support the already-deployed 1.6.9 call-ice function.
create or replace function public.authorize_call_relay(call_id uuid,device_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare c private.calls;u uuid:=auth.uid();
begin
 if exists(select 1 from private.live_calls lc where lc.id=authorize_call_relay.call_id) then return public.authorize_live_call_relay(call_id,device_id);end if;
 select * into c from private.calls where id=call_id for update;
 if u is null or c.status is distinct from 'accepted' or c.created_at<now()-interval '2 hours' or c.caller_seen<now()-interval '60 seconds' or c.callee_seen<now()-interval '60 seconds' or not private.is_member(c.room_id) or private.people_blocked(c.caller,c.callee) then return false;end if;
 if u=c.caller and device_id=c.caller_session and (c.caller_turn_at is null or c.caller_turn_at<now()-interval '1 minute') then update private.calls set caller_turn_at=now() where id=c.id;return true;end if;
 if u=c.callee and device_id=c.callee_session and (c.callee_turn_at is null or c.callee_turn_at<now()-interval '1 minute') then update private.calls set callee_turn_at=now() where id=c.id;return true;end if;
 return false;
end $$;
commit;
