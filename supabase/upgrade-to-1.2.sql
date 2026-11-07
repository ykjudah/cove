-- PocketChat 1.2.0: for an existing 1.1.0 or 1.1.1 database.
-- Run the entire script once. Safe to rerun. Preserves existing accounts and chats.
begin;
-- PocketChat 1.1.1: run after upgrade-1.1.sql, before publishing the update.
-- Safe to rerun; existing messages and reactions are preserved.
alter table public.message_reactions drop constraint if exists message_reactions_emoji_check;
alter table public.message_reactions add constraint message_reactions_emoji_check check (emoji in ('😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😎', '🤓', '🥳', '🤩', '🤔', '🫡', '🤨', '😐', '😑', '🙄', '😏', '😮', '😲', '😳', '🥺', '🥹', '😢', '😭', '😤', '😡', '🤯', '😱', '😴', '🤤', '🤢', '🤮', '🤡', '💀', '👻', '👽', '🤖', '💩', '👍', '👎', '👏', '🙌', '👐', '🤝', '🙏', '💪', '👊', '✊', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '👋', '🫶', '👀', '🧠', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💖', '🔥', '✨', '⭐', '🌟', '💯', '✅', '❌', '❓', '❗', '🎉', '🎊', '🎂', '🎁', '🏆', '🥇', '🚀', '⚡', '☀️', '🌙', '🌈', '🍀', '🌹', '🐱', '🐶', '🐰', '🐸', '🦆', '🦋', '🍕', '🍔', '🍿', '☕', '🎮', '🎵', '📸', '🗿'));
create or replace function public.toggle_reaction(target_message uuid, reaction text) returns public.message_reactions
language plpgsql security definer set search_path = '' as $$
declare target public.messages; result public.message_reactions;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if reaction is null or reaction not in ('😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😎', '🤓', '🥳', '🤩', '🤔', '🫡', '🤨', '😐', '😑', '🙄', '😏', '😮', '😲', '😳', '🥺', '🥹', '😢', '😭', '😤', '😡', '🤯', '😱', '😴', '🤤', '🤢', '🤮', '🤡', '💀', '👻', '👽', '🤖', '💩', '👍', '👎', '👏', '🙌', '👐', '🤝', '🙏', '💪', '👊', '✊', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '👋', '🫶', '👀', '🧠', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💖', '🔥', '✨', '⭐', '🌟', '💯', '✅', '❌', '❓', '❗', '🎉', '🎊', '🎂', '🎁', '🏆', '🥇', '🚀', '⚡', '☀️', '🌙', '🌈', '🍀', '🌹', '🐱', '🐶', '🐰', '🐸', '🦆', '🦋', '🍕', '🍔', '🍿', '☕', '🎮', '🎵', '📸', '🗿') then
    raise exception 'Unsupported reaction';
  end if;
  select * into target from public.messages where id = target_message for update;
  if not found or target.deleted_at is not null or not private.is_member(target.room_id) then
    raise exception 'Message unavailable';
  end if;
  insert into public.message_reactions(message_id, user_id, emoji)
    values (target_message, auth.uid(), reaction)
  on conflict (message_id, user_id, emoji) do update
    set active = not public.message_reactions.active, updated_at = now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.toggle_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;
-- PocketChat 1.2.0. Run after upgrade-1.1.sql and upgrade-1.1.1.sql.
-- Repeatable; accounts, conversations, messages, and reactions are preserved.
alter table public.profiles add column if not exists avatar_data text;
alter table public.profiles drop constraint if exists pocketchat_avatar_check;
alter table public.profiles add constraint pocketchat_avatar_check check (
  avatar_data is null or (octet_length(avatar_data) <= 32768 and avatar_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$')
);
drop policy if exists profiles_edit_avatar on public.profiles;
create policy profiles_edit_avatar on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update(avatar_data) on public.profiles to authenticated;

create table if not exists public.friendships (
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending','accepted','removed')),
  updated_at timestamptz not null default now(),
  primary key(sender_id, recipient_id), check (sender_id <> recipient_id)
);
create unique index if not exists friendships_pair_idx on public.friendships(least(sender_id,recipient_id),greatest(sender_id,recipient_id));
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id), check (blocker_id <> blocked_id)
);
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
revoke all on public.friendships, public.user_blocks from public, anon, authenticated;
grant select on public.friendships, public.user_blocks to authenticated;
drop policy if exists friendships_read on public.friendships;
create policy friendships_read on public.friendships for select to authenticated
using ((select auth.uid()) in (sender_id,recipient_id));
drop policy if exists blocks_read on public.user_blocks;
create policy blocks_read on public.user_blocks for select to authenticated
using (blocker_id = (select auth.uid()));

create or replace function private.lock_people(a uuid,b uuid) returns void
language sql security definer set search_path = '' as $$
 select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(a::text,b::text)||':'||greatest(a::text,b::text),0));
$$;
create or replace function private.people_blocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.user_blocks where active and
 ((blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a)));
$$;
revoke all on function private.lock_people(uuid,uuid), private.people_blocked(uuid,uuid) from public, anon, authenticated;

create or replace function public.social_action(action text, other_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); other_id uuid; rel public.friendships;
begin
 if me is null then raise exception 'Sign in first'; end if;
 if action is null or action not in ('request','accept','decline','cancel','remove','block','unblock') then raise exception 'Unknown action'; end if;
 select id into other_id from public.profiles where username=lower(btrim(other_username));
 if other_id is null then raise exception 'That username has not signed up yet'; end if;
 if other_id=me then raise exception 'Choose another person'; end if;
 perform private.lock_people(me,other_id);
 select * into rel from public.friendships where least(sender_id,recipient_id)=least(me,other_id) and greatest(sender_id,recipient_id)=greatest(me,other_id) for update;
 if action='block' then
  insert into public.user_blocks(blocker_id,blocked_id) values(me,other_id)
  on conflict(blocker_id,blocked_id) do update set active=true,updated_at=now();
  update public.friendships set status='removed',updated_at=now() where sender_id=rel.sender_id and recipient_id=rel.recipient_id;
 elsif action='unblock' then
  update public.user_blocks set active=false,updated_at=now() where blocker_id=me and blocked_id=other_id;
 elsif action in ('request','accept') and private.people_blocked(me,other_id) then
  raise exception 'This action is unavailable for this person';
 elsif action='request' then
  if rel.status='accepted' then raise exception 'You are already friends'; end if;
  if rel.status='pending' then raise exception 'A friend request is already pending'; end if;
  if rel.sender_id is null then
   insert into public.friendships(sender_id,recipient_id,status) values(me,other_id,'pending');
  else
   update public.friendships set sender_id=me,recipient_id=other_id,status='pending',updated_at=now() where sender_id=rel.sender_id and recipient_id=rel.recipient_id;
  end if;
 elsif action in ('accept','decline') then
  if rel.status is distinct from 'pending' or rel.recipient_id is distinct from me then raise exception 'No incoming request'; end if;
  update public.friendships set status=case when action='accept' then 'accepted' else 'removed' end,updated_at=now() where sender_id=rel.sender_id and recipient_id=rel.recipient_id;
 elsif action='cancel' then
  if rel.status is distinct from 'pending' or rel.sender_id is distinct from me then raise exception 'No outgoing request'; end if;
  update public.friendships set status='removed',updated_at=now() where sender_id=rel.sender_id and recipient_id=rel.recipient_id;
 elsif action='remove' then
  if rel.status is distinct from 'accepted' then raise exception 'You are not friends'; end if;
  update public.friendships set status='removed',updated_at=now() where sender_id=rel.sender_id and recipient_id=rel.recipient_id;
 end if;
end;
$$;
revoke all on function public.social_action(text,text) from public,anon;
grant execute on function public.social_action(text,text) to authenticated;

-- Keep the original room-creation implementation private behind block checks.
do $$ begin
 if to_regprocedure('private.start_dm_base(text)') is null then
  alter function public.start_dm(text) rename to start_dm_base;
  alter function public.start_dm_base(text) set schema private;
 end if;
 if to_regprocedure('private.create_group_base(text,text[])') is null then
  alter function public.create_group(text,text[]) rename to create_group_base;
  alter function public.create_group_base(text,text[]) set schema private;
 end if;
end $$;
revoke all on function private.start_dm_base(text),private.create_group_base(text,text[]) from public,anon,authenticated;
create or replace function public.start_dm(other_username text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare other_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select id into other_id from public.profiles where username=lower(btrim(other_username));
 if other_id is not null then
  perform private.lock_people(auth.uid(),other_id);
  if private.people_blocked(auth.uid(),other_id) then raise exception 'This conversation is unavailable'; end if;
 end if;
 return private.start_dm_base(other_username);
end;
$$;
create or replace function public.create_group(room_name text,usernames text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare people uuid[]; pair record;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if coalesce(cardinality(usernames),0) not between 1 and 29 then raise exception 'Enter 1 to 29 other usernames'; end if;
 select array_agg(id order by id) into people from public.profiles where id=auth.uid() or username in (select lower(btrim(u)) from unnest(usernames) u);
 for pair in select a,b from unnest(people) a cross join unnest(people) b where a<b order by a,b loop
  perform private.lock_people(pair.a,pair.b);
  if private.people_blocked(pair.a,pair.b) then raise exception 'These people cannot be added to the same new group'; end if;
 end loop;
 return private.create_group_base(room_name,usernames);
end;
$$;
revoke all on function public.start_dm(text),public.create_group(text,text[]) from public,anon;
grant execute on function public.start_dm(text),public.create_group(text,text[]) to authenticated;

-- Applies to old clients too, including sends to existing direct conversations.
create or replace function private.check_dm_block() returns trigger
language plpgsql security definer set search_path = '' as $$
declare other_id uuid;
begin
 if exists(select 1 from public.rooms where id=new.room_id and kind='dm') then
  select user_id into other_id from public.room_members where room_id=new.room_id and user_id<>auth.uid() limit 1;
  if other_id is not null then
   perform private.lock_people(auth.uid(),other_id);
   if private.people_blocked(auth.uid(),other_id) then raise exception 'Messaging is unavailable in this conversation'; end if;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.check_dm_block() from public,anon,authenticated;
drop trigger if exists pocketchat_dm_block on public.messages;
create trigger pocketchat_dm_block before insert on public.messages for each row execute function private.check_dm_block();

create or replace function private.check_reaction_block() returns trigger
language plpgsql security definer set search_path = '' as $$
declare author uuid;
begin
 if new.active then
  select sender_id into author from public.messages where id=new.message_id;
  perform private.lock_people(auth.uid(),author);
  if private.people_blocked(auth.uid(),author) then raise exception 'Reaction unavailable'; end if;
 end if;
 return new;
end;
$$;
revoke all on function private.check_reaction_block() from public,anon,authenticated;
drop trigger if exists pocketchat_reaction_block on public.message_reactions;
create trigger pocketchat_reaction_block before insert or update on public.message_reactions for each row execute function private.check_reaction_block();

do $$ declare t text; begin
 foreach t in array array['profiles','friendships','user_blocks'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $$;
commit;
