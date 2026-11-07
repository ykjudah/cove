-- Staged migration: not deployed. Apply with the next authorized release.
begin;
alter table public.profiles add column if not exists display_name text not null default '' check(char_length(display_name)<=40);
grant update(display_name) on public.profiles to authenticated;
-- Auth's admin update and this trigger share a transaction, so usernames cannot
-- diverge from login emails or be claimed by two accounts.
create or replace function private.sync_login_username() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email is distinct from old.email then
  if new.email !~ '^[a-z0-9_]{3,24}@users[.]example[.]com$' then raise exception 'Invalid username account'; end if;
  update public.profiles set username=split_part(new.email,'@',1) where id=new.id;
 end if;return new;
end $$;
revoke all on function private.sync_login_username() from public;
drop trigger if exists tungchat_login_username on auth.users;
create trigger tungchat_login_username after update of email on auth.users for each row execute function private.sync_login_username();

alter table public.messages add column if not exists system_event jsonb;
-- No client INSERT/UPDATE grant on system_event: only the trusted trigger sets it.
create or replace function private.group_change_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='group' and auth.uid() is not null then
  if old.name is distinct from new.name then
   insert into public.messages(room_id,sender_id,body,system_event) values(new.id,auth.uid(),'Group name changed',jsonb_build_object('kind','group_name','name',new.name));
  end if;
  if old.avatar_data is distinct from new.avatar_data then
   insert into public.messages(room_id,sender_id,body,system_event) values(new.id,auth.uid(),'Group picture changed',jsonb_build_object('kind','group_picture','removed',new.avatar_data is null));
  end if;
 end if;return new;
end $$;
revoke all on function private.group_change_notice() from public;
drop trigger if exists tungchat_group_notice on public.rooms;
create trigger tungchat_group_notice after update of name,avatar_data on public.rooms for each row execute function private.group_change_notice();

create table if not exists private.receipt_settings(user_id uuid primary key references public.profiles(id) on delete cascade,enabled boolean not null default false);
create table if not exists private.chat_reads(room_id uuid references public.rooms(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,read_at timestamptz not null,primary key(room_id,user_id));
create or replace function public.read_receipts_enabled() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select enabled from private.receipt_settings where user_id=auth.uid()),false) $$;
create or replace function public.set_read_receipts(enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 insert into private.receipt_settings values(auth.uid(),enabled) on conflict(user_id) do update set enabled=excluded.enabled;
 if not enabled then delete from private.chat_reads where user_id=auth.uid();end if;
end $$;
create or replace function public.chat_read_receipts(target_room uuid,mark_read boolean default false) returns table(user_id uuid,read_at timestamptz) language plpgsql security definer set search_path='' as $$
begin
 if not private.is_member(target_room) then raise exception 'Not a chat member';end if;
 if mark_read and public.read_receipts_enabled() then
  insert into private.chat_reads as r values(target_room,auth.uid(),now()) on conflict on constraint chat_reads_pkey do update set read_at=excluded.read_at;
 end if;
 return query select r.user_id,r.read_at from private.chat_reads r join private.receipt_settings s on s.user_id=r.user_id and s.enabled join public.room_members m on m.room_id=r.room_id and m.user_id=r.user_id where r.room_id=target_room;
end $$;
revoke all on function public.read_receipts_enabled(),public.set_read_receipts(boolean),public.chat_read_receipts(uuid,boolean) from public,anon;
grant execute on function public.read_receipts_enabled(),public.set_read_receipts(boolean),public.chat_read_receipts(uuid,boolean) to authenticated;
commit;
