-- Run ONCE in a new Supabase project's SQL Editor. All changes are atomic.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$')
);
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('dm', 'group')),
  dm_key text unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((kind = 'dm' and dm_key is not null) or (kind = 'group' and dm_key is null))
);
create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members(user_id, room_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_history_idx on public.messages(room_id, created_at desc, id desc);

create function private.handle_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare chosen text := new.raw_user_meta_data->>'username';
begin
  if chosen is null or chosen !~ '^[a-z0-9_]{3,24}$'
     or new.email is distinct from chosen || '@users.example.com' then
    raise exception 'Invalid username account';
  end if;
  insert into public.profiles(id, username) values (new.id, chosen);
  return new;
end;
$$;
create trigger pocketchat_signup after insert on auth.users
for each row execute function private.handle_signup();

create function private.is_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.room_members where room_id = target and user_id = auth.uid());
$$;
revoke all on function private.handle_signup() from public;
revoke all on function private.is_member(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;

-- Usernames are a directory visible to signed-in users. Other account data is not exposed.
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy rooms_read on public.rooms for select to authenticated using (private.is_member(id));
create policy members_read on public.room_members for select to authenticated using (private.is_member(room_id));
create policy messages_read on public.messages for select to authenticated using (private.is_member(room_id));
create policy messages_send on public.messages for insert to authenticated
with check (sender_id = (select auth.uid()) and private.is_member(room_id));

revoke all on public.profiles, public.rooms, public.room_members, public.messages from anon, authenticated;
grant select on public.profiles, public.rooms, public.room_members, public.messages to authenticated;
-- Clients cannot forge sender IDs or server timestamps.
grant insert(id, room_id, body) on public.messages to authenticated;

create function public.start_dm(other_username text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); other_id uuid; result uuid; pair text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select id into other_id from public.profiles where username = lower(btrim(other_username));
  if other_id is null then raise exception 'That username has not signed up yet'; end if;
  if other_id = me then raise exception 'Choose a friend, not yourself'; end if;
  pair := least(me::text, other_id::text) || ':' || greatest(me::text, other_id::text);
  insert into public.rooms(name, kind, dm_key, created_by)
  values ('Direct message', 'dm', pair, me) on conflict (dm_key) do nothing;
  select id into result from public.rooms where dm_key = pair;
  insert into public.room_members(room_id, user_id) values (result, me), (result, other_id)
  on conflict do nothing;
  return result;
end;
$$;

create function public.create_group(room_name text, usernames text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); result uuid; people uuid[]; requested text[];
begin
  if me is null then raise exception 'Sign in first'; end if;
  if room_name is null or char_length(btrim(room_name)) not between 1 and 60 then
    raise exception 'Use a room name between 1 and 60 characters';
  end if;
  select array_agg(distinct lower(btrim(u))) into requested from unnest(usernames) u;
  if coalesce(cardinality(requested), 0) not between 1 and 29 then
    raise exception 'Enter 1 to 29 other usernames';
  end if;
  select array_agg(id) into people from public.profiles where username = any(requested);
  if coalesce(cardinality(people), 0) <> cardinality(requested) then
    raise exception 'One or more usernames have not signed up yet';
  end if;
  if not exists(select 1 from unnest(people) p where p <> me) then
    raise exception 'Include at least one friend';
  end if;
  insert into public.rooms(name, kind, created_by) values (btrim(room_name), 'group', me) returning id into result;
  insert into public.room_members(room_id, user_id)
  select result, p from unnest(array_append(people, me)) p on conflict do nothing;
  return result;
end;
$$;
revoke all on function public.start_dm(text), public.create_group(text, text[]) from public, anon;
grant execute on function public.start_dm(text), public.create_group(text, text[]) to authenticated;

-- Live events are subject to the same read policies as message history.
alter publication supabase_realtime add table public.messages, public.room_members;

-- Ephemeral typing events are sent only on private topics for room members.
drop policy if exists pocketchat_typing_receive on realtime.messages;
drop policy if exists pocketchat_typing_send on realtime.messages;
create policy pocketchat_typing_receive on realtime.messages for select to authenticated
using (extension = 'broadcast'
  and (select realtime.topic()) ~ '^pocketchat-typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_member(substring((select realtime.topic()) from 19)::uuid));
create policy pocketchat_typing_send on realtime.messages for insert to authenticated
with check (extension = 'broadcast'
  and (select realtime.topic()) ~ '^pocketchat-typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_member(substring((select realtime.topic()) from 19)::uuid));
commit;
