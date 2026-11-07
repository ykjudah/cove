begin;
-- Signaling only. Audio/video is never stored in the database.
create table if not exists private.calls (
 id uuid primary key, room_id uuid not null references public.rooms(id) on delete cascade,
 caller uuid not null references auth.users(id) on delete cascade,
 callee uuid not null references auth.users(id) on delete cascade,
 caller_session uuid not null, callee_session uuid,
 video boolean not null, status text not null default 'ringing' check(status in ('ringing','accepted','ended')),
 offer jsonb, answer jsonb, created_at timestamptz not null default now(),
 caller_seen timestamptz not null default now(), callee_seen timestamptz not null default now(),
 caller_turn_at timestamptz, callee_turn_at timestamptz
);
alter table private.calls enable row level security;
revoke all on private.calls from public,anon,authenticated;
create index if not exists calls_created on private.calls(created_at);
create or replace function private.clean_calls() returns void language sql security definer set search_path='' as $$
 update private.calls set status='ended',offer=null,answer=null
 where status<>'ended' and (created_at<now()-interval '2 hours' or
 (status='ringing' and created_at<now()-interval '45 seconds') or
 caller_seen<now()-interval '60 seconds' or (status='accepted' and callee_seen<now()-interval '60 seconds'));
 delete from private.calls where created_at<now()-interval '1 day';
$$;
create or replace function public.call_action(call_id uuid,device_id uuid,action text,target_room uuid default null,wants_video boolean default true,description jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.calls; other_id uuid; u uuid:=auth.uid();
begin
 if u is null or device_id is null or call_id is null then raise exception 'Sign in to call';end if;
 perform private.clean_calls();
 if action='start' then
  -- Serialize reservation of both participants, including simultaneous crossed calls.
  perform pg_advisory_xact_lock(7239142);
  select * into c from private.calls where id=call_id;
  if found then
   if c.caller=u and c.caller_session=device_id then return to_jsonb(c);end if;
   raise exception 'Call unavailable';
  end if;
  if not private.is_member(target_room) or not exists(select 1 from public.rooms where id=target_room and kind='dm') then raise exception 'Open a direct message to call';end if;
  select user_id into other_id from public.room_members where room_id=target_room and user_id<>u;
  if other_id is null or (select count(*) from public.room_members where room_id=target_room)<>2 or private.people_blocked(u,other_id) then raise exception 'Call unavailable';end if;
  if exists(select 1 from private.calls where status<>'ended' and (caller in (u,other_id) or callee in (u,other_id))) then raise exception 'One of you is already in a call';end if;
  if (select count(*) from private.calls where caller=u and created_at>now()-interval '1 minute')>=5 then raise exception 'Wait a minute before calling again';end if;
  insert into private.calls(id,room_id,caller,callee,caller_session,video) values(call_id,target_room,u,other_id,device_id,coalesce(wants_video,true)) returning * into c;
  return to_jsonb(c);
 end if;
 select * into c from private.calls where id=call_id for update;
 if not found or u not in(c.caller,c.callee) then raise exception 'Call unavailable';end if;
 if action='accept' then
  if u<>c.callee or c.status<>'ringing' or private.people_blocked(c.caller,c.callee) or not private.is_member(c.room_id) then raise exception 'Call no longer available';end if;
  update private.calls set status='accepted',callee_session=device_id,callee_seen=now() where id=c.id;
 elsif action='end' then
  if not ((u=c.caller and device_id=c.caller_session) or (u=c.callee and (c.status='ringing' or device_id=c.callee_session))) then raise exception 'Call is open on another device';end if;
  update private.calls set status='ended',offer=null,answer=null where id=c.id;
 elsif action in ('offer','answer') then
  if c.status<>'accepted' or not private.is_member(c.room_id) or private.people_blocked(c.caller,c.callee) then raise exception 'Call no longer available';end if;
  if description is null or jsonb_typeof(description->'sdp') is distinct from 'string' or coalesce(length(description->>'sdp'),0) not between 10 and 100000 or description->>'type' is distinct from action then raise exception 'Invalid call description';end if;
  description:=jsonb_build_object('type',action,'sdp',description->>'sdp');
  if action='offer' and u=c.caller and device_id=c.caller_session and c.offer is null then update private.calls set offer=description where id=c.id;
  elsif action='answer' and u=c.callee and device_id=c.callee_session and c.offer is not null and c.answer is null then update private.calls set answer=description where id=c.id;
  else raise exception 'Call changed or belongs to another device';end if;
 else raise exception 'Invalid call action';end if;
 select * into c from private.calls where id=call_id;return to_jsonb(c);
end $$;
create or replace function public.poll_calls(device_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.calls;u uuid:=auth.uid();
begin
 if u is null or device_id is null then raise exception 'Sign in to call';end if;
 perform private.clean_calls();
 update private.calls set status='ended',offer=null,answer=null where status<>'ended' and u in(caller,callee) and (private.people_blocked(caller,callee) or not private.is_member(room_id));
 select * into c from private.calls where status<>'ended' and ((caller=u and caller_session=device_id) or (callee=u and (status='ringing' or callee_session=device_id))) order by created_at desc limit 1;
 if not found then return null;end if;
 update private.calls set caller_seen=case when caller=u then now() else caller_seen end,callee_seen=case when callee=u and status='accepted' then now() else callee_seen end where id=c.id;
 return to_jsonb(c);
end $$;
-- Limit TURN credential creation to an accepted call on this device, once per minute.
create or replace function public.authorize_call_relay(call_id uuid,device_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare c private.calls;u uuid:=auth.uid();
begin
 select * into c from private.calls where id=call_id for update;
 if u is null or c.status is distinct from 'accepted' or c.created_at<now()-interval '2 hours' or c.caller_seen<now()-interval '60 seconds' or c.callee_seen<now()-interval '60 seconds' or not private.is_member(c.room_id) or private.people_blocked(c.caller,c.callee) then return false;end if;
 if u=c.caller and device_id=c.caller_session and (c.caller_turn_at is null or c.caller_turn_at<now()-interval '1 minute') then update private.calls set caller_turn_at=now() where id=c.id;return true;end if;
 if u=c.callee and device_id=c.callee_session and (c.callee_turn_at is null or c.callee_turn_at<now()-interval '1 minute') then update private.calls set callee_turn_at=now() where id=c.id;return true;end if;
 return false;
end $$;
revoke all on function private.clean_calls() from public,anon,authenticated;
revoke all on function public.call_action(uuid,uuid,text,uuid,boolean,jsonb),public.poll_calls(uuid),public.authorize_call_relay(uuid,uuid) from public,anon;
grant execute on function public.call_action(uuid,uuid,text,uuid,boolean,jsonb),public.poll_calls(uuid),public.authorize_call_relay(uuid,uuid) to authenticated;
-- Cleanup also runs on all call requests. If Cron is installed, remove abandoned data without traffic.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  if exists(select 1 from cron.job where jobname='sahur-call-cleanup') then perform cron.unschedule('sahur-call-cleanup');end if;
  perform cron.schedule('sahur-call-cleanup','* * * * *','select private.clean_calls()');
 end if;
end $$;
commit;
