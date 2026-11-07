-- PocketChat 1.3.1. Run once after upgrade-1.3.sql.
-- Allows owner moderation to permanently delete accounts while retaining shared
-- chat history with the deleted sender anonymized.
begin;

-- Keep messages and rooms when their author/creator account is removed.
do $$ declare fk record; begin
  for fk in
    select distinct c.conname
    from pg_constraint c
    join unnest(c.conkey) key(attnum) on true
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=key.attnum
    where c.conrelid='public.messages'::regclass and c.contype='f'
      and c.confrelid='public.profiles'::regclass and a.attname='sender_id'
  loop
    execute format('alter table public.messages drop constraint %I',fk.conname);
  end loop;
  for fk in
    select distinct c.conname
    from pg_constraint c
    join unnest(c.conkey) key(attnum) on true
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=key.attnum
    where c.conrelid='public.rooms'::regclass and c.contype='f'
      and c.confrelid='public.profiles'::regclass and a.attname='created_by'
  loop
    execute format('alter table public.rooms drop constraint %I',fk.conname);
  end loop;
end $$;

alter table public.messages alter column sender_id drop not null;
alter table public.messages add constraint pocketchat_message_sender_profile_fk
  foreign key(sender_id) references public.profiles(id) on delete set null;
alter table public.rooms alter column created_by drop not null;
alter table public.rooms add constraint pocketchat_room_creator_profile_fk
  foreign key(created_by) references public.profiles(id) on delete set null;

-- A narrowly scoped SECURITY DEFINER RPC runs the Auth deletion inside
-- Postgres. The caller identity comes from the verified Supabase JWT, never
-- from a client-supplied owner ID. No service key or extra Edge Function is needed.
create or replace function public.moderation_delete_account(target_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from private.app_owner where user_id=auth.uid()) then
    raise exception 'Owner access required';
  end if;
  if target_user is null or target_user=auth.uid() then
    raise exception 'You cannot delete the owner account';
  end if;
  if exists(select 1 from private.app_owner where user_id=target_user) then
    raise exception 'Owner accounts are protected';
  end if;
  delete from auth.users where id=target_user;
  if not found then raise exception 'Account not found'; end if;
end;
$$;
revoke all on function public.moderation_delete_account(uuid) from public, anon;
grant execute on function public.moderation_delete_account(uuid) to authenticated;

commit;
