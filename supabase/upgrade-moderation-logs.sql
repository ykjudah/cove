begin;
create table if not exists private.app_admins(user_id uuid primary key references public.profiles(id) on delete cascade);
revoke all on private.app_admins from public,anon,authenticated;
create or replace function public.is_app_admin() returns boolean language sql stable security definer set search_path='' as $$select public.is_app_owner() or exists(select 1 from private.app_admins where user_id=auth.uid())$$;
create or replace function public.set_app_admin(username_input text,enabled boolean) returns void language plpgsql security definer set search_path='' as $$ declare u uuid;begin
if not public.is_app_owner() then raise exception 'Owner access required';end if;
select id into u from public.profiles where lower(username)=lower(btrim(username_input));if u is null then raise exception 'User not found';end if;
if enabled then insert into private.app_admins values(u) on conflict do nothing;else delete from private.app_admins where user_id=u;end if;end $$;
create or replace function public.list_app_admins() returns table(username text) language plpgsql security definer set search_path='' as $$begin if not public.is_app_owner() then raise exception 'Owner access required';end if;return query select p.username from public.profiles p join private.app_admins a on a.user_id=p.id order by p.username;end $$;
alter table public.moderation_ip_events add column if not exists match_eligible boolean not null default false;
update public.moderation_ip_events set match_eligible=true where ip_fingerprint in(select ip_fingerprint from public.moderation_ip_events where ip_address is not null and ip_address not in('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet,'168.9.116.17'::inet,'::ffff:168.9.116.17'::inet));
create table if not exists private.ignored_ip_fingerprints(fingerprint text primary key);
revoke all on private.ignored_ip_fingerprints from public,anon,authenticated;
insert into private.ignored_ip_fingerprints select distinct ip_fingerprint from public.moderation_ip_events where ip_address in ('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet,'168.9.116.17'::inet,'::ffff:168.9.116.17'::inet) on conflict do nothing;
delete from public.moderation_ip_events where ip_fingerprint in(select fingerprint from private.ignored_ip_fingerprints);
create or replace function public.exclude_school_fingerprint(school_ip inet,fingerprint text) returns void language plpgsql security definer set search_path='' as $$begin
if school_ip not in ('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet,'168.9.116.17'::inet,'::ffff:168.9.116.17'::inet) or fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid exclusion';end if;
insert into private.ignored_ip_fingerprints values(fingerprint) on conflict do nothing;
delete from public.moderation_ip_events where ip_fingerprint=fingerprint;end $$;
revoke all on function public.exclude_school_fingerprint(inet,text) from public,anon,authenticated;grant execute on function public.exclude_school_fingerprint(inet,text) to service_role;
create or replace function public.record_moderation_ip_event(
  target_user uuid, target_ip inet, target_fingerprint text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if target_user is null or target_ip is null or target_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid moderation event';
  end if;
  if target_ip in ('168.9.11.17'::inet,'::ffff:168.9.11.17'::inet,'168.9.116.17'::inet,'::ffff:168.9.116.17'::inet) then
    perform public.exclude_school_fingerprint(target_ip,target_fingerprint);return false;
  end if;
  if exists(select 1 from private.ignored_ip_fingerprints where fingerprint=target_fingerprint) then return false;end if;
  perform private.purge_moderation_ip_events();
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'Account not found';
  end if;
  -- At most one record per account per 15 minutes limits abuse and avoids noisy logs.
  if exists (select 1 from public.moderation_ip_events
             where user_id = target_user and seen_at > now() - interval '15 minutes') then
    return false;
  end if;
  update public.moderation_ip_events set match_eligible=true where ip_fingerprint=target_fingerprint and not match_eligible;
  insert into public.moderation_ip_events(user_id, ip_address, ip_fingerprint,match_eligible)
    values (target_user, target_ip, target_fingerprint,true);
  return true;
end;
$$;
revoke all on function public.record_moderation_ip_event(uuid, inet, text) from public, anon, authenticated;
grant execute on function public.record_moderation_ip_event(uuid, inet, text) to service_role;

create or replace function public.moderation_overview()
returns table (
  account_id uuid,
  username text,
  account_created_at timestamptz,
  last_seen_at timestamptz,
  last_ip text,
  possible_matches jsonb
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required';end if;
  perform private.purge_moderation_ip_events();
  return query
  with recent as (
    select distinct on (e.user_id)
      e.user_id, e.seen_at, host(e.ip_address) as ip, e.ip_fingerprint
    from public.moderation_ip_events e
    where e.seen_at > now() - interval '90 days'
    order by e.user_id, e.seen_at desc, e.id desc
  ), matched_accounts as (
    select a.user_id, b.user_id as matched_user_id,
      max(greatest(a.seen_at, b.seen_at)) as last_match_at
    from public.moderation_ip_events a
    join public.moderation_ip_events b
      on b.ip_fingerprint = a.ip_fingerprint
     and b.user_id <> a.user_id
     and b.seen_at > now() - interval '90 days'
    where a.match_eligible and b.match_eligible and a.seen_at > now() - interval '90 days'
    group by a.user_id, b.user_id
  ), matches as (
    select m.user_id,
      jsonb_agg(jsonb_build_object(
        'account_id', p2.id,
        'username', p2.username,
        'last_seen_at', m.last_match_at
      ) order by p2.username) as candidates
    from matched_accounts m
    join public.profiles p2 on p2.id = m.matched_user_id
    group by m.user_id
  )
  select p.id, p.username, u.created_at, r.seen_at, r.ip,
    coalesce(m.candidates, '[]'::jsonb)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join recent r on r.user_id = p.id
  left join matches m on m.user_id = p.id
  order by p.username;
end;
$$;
revoke all on function public.moderation_overview() from public, anon;
grant execute on function public.moderation_overview() to authenticated;
create table if not exists private.activity_log(id bigint generated always as identity primary key,at timestamptz not null default now(),actor uuid,username text,action text not null,room_id uuid,object_id text);
alter table private.activity_log add column if not exists destination text;
alter table private.activity_log add column if not exists destination_kind text;
create index if not exists activity_log_at on private.activity_log(at desc);
revoke all on private.activity_log from public,anon,authenticated;
create or replace function private.audit_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;old_data jsonb;who uuid:=auth.uid();event text;rid uuid;destination_name text;chat_kind text;
begin
row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;old_data:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
if tg_op='UPDATE' and row_data=old_data then return new;end if;
if tg_table_name='rooms' and tg_op='UPDATE' and (row_data-'last_activity_at')=(old_data-'last_activity_at') then return new;end if;
if tg_table_name='messages' then
 event:=case when tg_op='INSERT' then 'Sent a message' when tg_op='DELETE' or row_data->>'deleted_at' is distinct from old_data->>'deleted_at' then 'Deleted a message' else 'Edited a message' end;
 who:=coalesce(who,(row_data->>'sender_id')::uuid);
elsif tg_table_name='room_members' then event:=case when tg_op='INSERT' then 'Joined or added to a chat' else 'Left or removed from a chat' end;who:=coalesce(who,(row_data->>'user_id')::uuid);
elsif tg_table_name='profiles' then event:=case when tg_op='INSERT' then 'Account created' when tg_op='DELETE' then 'Account deleted' else 'Profile updated' end;who:=coalesce(who,(row_data->>'id')::uuid);
elsif tg_table_name='rooms' then event:='Chat '||lower(tg_op);
elsif tg_table_name='chat_media' then event:=case when tg_op='INSERT' then 'Uploaded '||coalesce(row_data->>'kind','media') else 'Updated media collection' end;
elsif tg_table_name='friendships' then event:='Friendship '||case when tg_op='DELETE' then 'removed' else coalesce(row_data->>'status','updated') end;
elsif tg_table_name='user_blocks' then event:=case when tg_op='DELETE' then 'Unblocked an account' else 'Blocked an account' end;
elsif tg_table_name='message_reactions' then event:=case when row_data->>'active'='false' or tg_op='DELETE' then 'Removed a reaction' else 'Reacted to a message' end;
elsif tg_table_name='hidden_rooms' then event:=case when tg_op='INSERT' then 'Closed a DM' else 'Reopened a DM' end;
elsif tg_table_name='emoji_collection' then event:=case when tg_op='INSERT' then 'Saved a custom emoji' else 'Removed a custom emoji' end;
elsif tg_table_name='app_admins' then event:=case when tg_op='INSERT' then 'Granted moderation access' else 'Removed moderation access' end;
elsif tg_table_name='live_calls' then
 if tg_op='UPDATE' and row_data->>'ended_at' is not distinct from old_data->>'ended_at' then return new;end if;
 event:=case when tg_op='INSERT' then 'Started a call' else 'Call closed' end;who:=case when tg_op='INSERT' then (row_data->>'creator')::uuid else null end;
elsif tg_table_name='live_call_members' then
 if tg_op='UPDATE' and row_data->>'status' is not distinct from old_data->>'status' then return new;end if;
 if row_data->>'status'='invited' then return new;end if;
 event:=case when row_data->>'status'='joined' then 'Joined a call' else 'Call participation ended' end;who:=(row_data->>'user_id')::uuid;
else
 if tg_op='UPDATE' and row_data->>'revision' is not distinct from old_data->>'revision' and row_data->>'player2' is not distinct from old_data->>'player2' then return new;end if;
 event:=replace(tg_table_name,'_',' ')||' '||case when tg_op='INSERT' then 'invited' else 'played' end;
end if;
rid:=nullif(row_data->>'room_id','')::uuid;
if rid is not null then
 select r.kind,case when r.kind='group' then r.name else
 (select string_agg(p.username,', ' order by p.username) from public.room_members m join public.profiles p on p.id=m.user_id
 where m.room_id=rid and m.user_id is distinct from coalesce(nullif(row_data->>'sender_id','')::uuid,who)) end
 into chat_kind,destination_name from public.rooms r where r.id=rid;
end if;
insert into private.activity_log(actor,username,action,room_id,object_id,destination,destination_kind)
values(who,(select username from public.profiles where id=who),event,rid,coalesce(row_data->>'id',row_data->>'call_id'),destination_name,chat_kind);
delete from private.activity_log where at<now()-interval '30 days';return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.audit_activity() from public,anon,authenticated;
create or replace function public.moderation_logs(before_id bigint default null) returns setof private.activity_log language plpgsql security definer set search_path='' as $$begin
if not public.is_app_admin() then raise exception 'Admin access required';end if;
delete from private.activity_log where at<now()-interval '30 days';
return query select * from private.activity_log where before_id is null or id<before_id order by id desc limit 100;end $$;
create or replace function public.record_sign_in() returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null then raise exception 'Sign in required';end if;
if not exists(select 1 from private.activity_log where actor=auth.uid() and action='Signed in' and at>now()-interval '15 minutes') then insert into private.activity_log(actor,username,action) select id,username,'Signed in' from public.profiles where id=auth.uid();end if;end $$;
revoke all on function public.is_app_admin(),public.set_app_admin(text,boolean),public.list_app_admins(),public.moderation_logs(bigint),public.record_sign_in() from public,anon;
grant execute on function public.is_app_admin(),public.set_app_admin(text,boolean),public.list_app_admins(),public.moderation_logs(bigint),public.record_sign_in() to authenticated;
do $$declare t text;begin
foreach t in array array['messages','profiles','rooms','room_members','chat_media','friendships','user_blocks','message_reactions','hidden_rooms','emoji_collection','chat_games','chess_games','golf_games'] loop
execute format('drop trigger if exists activity_audit on public.%I',t);execute format('create trigger activity_audit after insert or update or delete on public.%I for each row execute function private.audit_activity()',t);end loop;
if exists(select 1 from pg_extension where extname='pg_cron') then
 if exists(select 1 from cron.job where jobname='sahur-log-retention') then perform cron.unschedule('sahur-log-retention');end if;
 perform cron.schedule('sahur-log-retention','15 * * * *',$job$delete from private.activity_log where at<now()-interval '30 days'$job$);
end if;end $$;
drop trigger if exists admin_activity on private.app_admins;create trigger admin_activity after insert or delete on private.app_admins for each row execute function private.audit_activity();
commit;
