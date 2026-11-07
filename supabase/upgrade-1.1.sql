-- Existing PocketChat 1.0 project: run this script once in SQL Editor.
-- Safe to rerun. Existing accounts, rooms, and messages are preserved.
begin;

alter table public.messages add column if not exists reply_to uuid;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists pocketchat_message_body_check;
alter table public.messages add constraint pocketchat_message_body_check check (
  (deleted_at is null and char_length(btrim(body)) between 1 and 4000)
  or (deleted_at is not null and body = '')
);
do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'pocketchat_reply_fk' and conrelid = 'public.messages'::regclass) then
    alter table public.messages add constraint pocketchat_reply_fk foreign key(reply_to) references public.messages(id);
  end if;
end $$;

create or replace function private.check_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parent public.messages;
begin
  if new.reply_to is not null then
    select * into parent from public.messages where id = new.reply_to for share;
    if not found or parent.room_id <> new.room_id or parent.deleted_at is not null then
      raise exception 'Reply target is unavailable in this conversation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.check_reply() from public;
drop trigger if exists pocketchat_check_reply on public.messages;
create trigger pocketchat_check_reply before insert on public.messages
for each row execute function private.check_reply();
grant insert(reply_to) on public.messages to authenticated;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🔥')),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(message_id, user_id, emoji)
);
alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;
drop policy if exists reactions_read on public.message_reactions;
create policy reactions_read on public.message_reactions for select to authenticated using (
  exists(select 1 from public.messages m where m.id = message_id and private.is_member(m.room_id))
);

-- Only the author can delete. Keep a tombstone so existing replies remain valid.
-- The original body is erased, rather than just hidden by the client.
create or replace function public.delete_message(target_message uuid) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare target public.messages;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into target from public.messages where id = target_message for update;
  if not found or target.sender_id <> auth.uid() or not private.is_member(target.room_id) then
    raise exception 'You can only delete your own messages';
  end if;
  update public.messages set body = '', deleted_at = coalesce(deleted_at, now())
  where id = target_message returning * into target;
  return target;
end;
$$;

-- A serialized toggle gives each person at most one of each reaction per message.
-- Inactive rows let removal travel as a secured UPDATE event, not an unfiltered DELETE.
create or replace function public.toggle_reaction(target_message uuid, reaction text) returns public.message_reactions
language plpgsql security definer set search_path = '' as $$
declare target public.messages; result public.message_reactions;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if reaction is null or reaction not in ('👍', '❤️', '😂', '😮', '😢', '🔥') then
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
revoke all on function public.delete_message(uuid), public.toggle_reaction(uuid, text) from public, anon;
grant execute on function public.delete_message(uuid), public.toggle_reaction(uuid, text) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
commit;
