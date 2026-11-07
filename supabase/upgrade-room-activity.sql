begin;
alter table public.rooms add column if not exists last_activity_at timestamptz;
update public.rooms r set last_activity_at=greatest(r.created_at,coalesce((select max(m.created_at) from public.messages m where m.room_id=r.id),r.created_at)) where last_activity_at is null;
alter table public.rooms alter column last_activity_at set default now();
create or replace function private.bump_room_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.rooms set last_activity_at=greatest(coalesce(last_activity_at,created_at),new.created_at) where id=new.room_id;
 return new;
end $$;
revoke all on function private.bump_room_activity() from public,anon,authenticated;
drop trigger if exists bump_room_activity on public.messages;
create trigger bump_room_activity after insert on public.messages for each row execute function private.bump_room_activity();
commit;
