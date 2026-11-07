-- PocketChat 1.3.0. Run after upgrade-to-1.2.sql.
-- Repeatable. Preserves accounts, rooms, messages, and reactions.
begin;

alter table public.profiles add column if not exists about_me text not null default '';
alter table public.profiles drop constraint if exists pocketchat_about_me_check;
alter table public.profiles add constraint pocketchat_about_me_check
  check (char_length(about_me) <= 500);
grant update(avatar_data, about_me) on public.profiles to authenticated;

alter table public.rooms add column if not exists avatar_data text;
alter table public.rooms drop constraint if exists pocketchat_room_avatar_check;
alter table public.rooms add constraint pocketchat_room_avatar_check check (
  avatar_data is null or
  (octet_length(avatar_data) <= 32768 and avatar_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$')
);
alter table public.rooms drop constraint if exists pocketchat_group_name_check;
alter table public.rooms add constraint pocketchat_group_name_check
  check (kind <> 'group' or (char_length(btrim(name)) between 1 and 60));
drop policy if exists groups_edit on public.rooms;
create policy groups_edit on public.rooms for update to authenticated
  using (kind = 'group' and private.is_member(id))
  with check (kind = 'group' and private.is_member(id));
grant update(name, avatar_data) on public.rooms to authenticated;

create table if not exists public.hidden_rooms (
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
alter table public.hidden_rooms enable row level security;
revoke all on public.hidden_rooms from public, anon, authenticated;
grant select, insert, delete on public.hidden_rooms to authenticated;
drop policy if exists hidden_rooms_read on public.hidden_rooms;
create policy hidden_rooms_read on public.hidden_rooms for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(room_id));
drop policy if exists hidden_dm_insert on public.hidden_rooms;
create policy hidden_dm_insert on public.hidden_rooms for insert to authenticated
  with check (
    user_id = (select auth.uid()) and private.is_member(room_id) and
    exists (select 1 from public.rooms where id = room_id and kind = 'dm')
  );
drop policy if exists hidden_dm_delete on public.hidden_rooms;
create policy hidden_dm_delete on public.hidden_rooms for delete to authenticated
  using (
    user_id = (select auth.uid()) and private.is_member(room_id) and
    exists (select 1 from public.rooms where id = room_id and kind = 'dm')
  );

create or replace function public.leave_group(target_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.rooms where id = target_room and kind = 'group') then
    raise exception 'Group not found';
  end if;
  delete from public.room_members where room_id = target_room and user_id = auth.uid();
  if not found then raise exception 'You are not a member of this group'; end if;
end;
$$;
revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;

create table if not exists private.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  set_at timestamptz not null default now()
);
revoke all on private.app_owner from public, anon, authenticated;

-- This table has no client-facing policies or grants. The edge function writes it
-- with its server-only service key, and owner-only RPCs read it after checking app_owner.
create table if not exists public.moderation_ip_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ip_address inet,
  ip_fingerprint text not null check (ip_fingerprint ~ '^[0-9a-f]{64}$'),
  seen_at timestamptz not null default now()
);
create index if not exists moderation_ip_events_user_seen_idx
  on public.moderation_ip_events(user_id, seen_at desc);
create index if not exists moderation_ip_events_fingerprint_seen_idx
  on public.moderation_ip_events(ip_fingerprint, seen_at desc);
alter table public.moderation_ip_events enable row level security;
revoke all on public.moderation_ip_events from public, anon, authenticated;
grant all on public.moderation_ip_events to service_role;

create or replace function public.record_moderation_ip_event(
  target_user uuid, target_ip inet, target_fingerprint text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if target_user is null or target_ip is null or target_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid moderation event';
  end if;
  perform private.purge_moderation_ip_events();
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'Account not found';
  end if;
  -- At most one record per account per 15 minutes limits abuse and avoids noisy logs.
  if exists (select 1 from public.moderation_ip_events
             where user_id = target_user and seen_at > now() - interval '15 minutes') then
    return false;
  end if;
  insert into public.moderation_ip_events(user_id, ip_address, ip_fingerprint)
    values (target_user, target_ip, target_fingerprint);
  return true;
end;
$$;
revoke all on function public.record_moderation_ip_event(uuid, inet, text) from public, anon, authenticated;
grant execute on function public.record_moderation_ip_event(uuid, inet, text) to service_role;

create or replace function private.purge_moderation_ip_events() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.moderation_ip_events set ip_address = null
    where ip_address is not null and seen_at < now() - interval '7 days';
  delete from public.moderation_ip_events where seen_at < now() - interval '90 days';
end;
$$;
revoke all on function private.purge_moderation_ip_events() from public, anon, authenticated;

create or replace function public.is_app_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.app_owner where user_id = auth.uid());
$$;
revoke all on function public.is_app_owner() from public, anon;
grant execute on function public.is_app_owner() to authenticated;

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
  if auth.uid() is null or not exists (
    select 1 from private.app_owner where user_id = auth.uid()
  ) then raise exception 'Owner access required'; end if;
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
    where a.seen_at > now() - interval '90 days'
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

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hidden_rooms') then
      alter publication supabase_realtime add table public.hidden_rooms;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
      alter publication supabase_realtime add table public.rooms;
    end if;
  end if;
  if to_regnamespace('cron') is not null then
    perform cron.schedule('pocketchat-ip-retention', '0 3 * * *',
      'select private.purge_moderation_ip_events();');
  end if;
end $$;

commit;
