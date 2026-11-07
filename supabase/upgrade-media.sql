begin;
create table if not exists public.chat_media(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 room_id uuid references public.rooms(id) on delete cascade,
 kind text not null check(kind in('image','emoji')),
 name text not null check(char_length(name) between 1 and 60),
 archived boolean not null default false,
 created_at timestamptz not null default now(),
 check((kind='image' and room_id is not null) or (kind='emoji' and room_id is null))
);
alter table public.chat_media enable row level security;
revoke all on public.chat_media from public,anon,authenticated;
grant select,insert on public.chat_media to authenticated;
grant update(archived) on public.chat_media to authenticated;
create or replace function private.can_read_media(media_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.chat_media a where a.id=media_id and
 (a.owner_id=auth.uid() or (not private.people_blocked(auth.uid(),a.owner_id) and
 (exists(select 1 from public.messages m where m.deleted_at is null and m.body='[[tungchat-media:v1]]'||a.id::text and private.is_member(m.room_id))))))
$$;
revoke all on function private.can_read_media(uuid) from public,anon;
grant execute on function private.can_read_media(uuid) to authenticated;
drop policy if exists media_read on public.chat_media;
create policy media_read on public.chat_media for select to authenticated using(owner_id=auth.uid() or private.can_read_media(id));
drop policy if exists media_insert on public.chat_media;
create policy media_insert on public.chat_media for insert to authenticated with check(owner_id=auth.uid() and not archived and (kind='emoji' or private.is_member(room_id)));
drop policy if exists media_archive on public.chat_media;
create policy media_archive on public.chat_media for update to authenticated using(owner_id=auth.uid() and kind='emoji') with check(owner_id=auth.uid() and kind='emoji');
create or replace function private.validate_media_message() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.chat_media;media_id uuid;
begin
 if new.body like '[[tungchat-media:v1]]%' then
 begin media_id:=substring(new.body from char_length('[[tungchat-media:v1]]')+1)::uuid;exception when others then raise exception 'Invalid image';end;
 select * into a from public.chat_media where id=media_id;
 if a.id is null or a.owner_id<>auth.uid() or a.archived or (a.kind='image' and a.room_id<>new.room_id) then raise exception 'Image unavailable';end if;
 end if;return new;
end $$;
revoke all on function private.validate_media_message() from public,anon,authenticated;
drop trigger if exists message_media_check on public.messages;
create trigger message_media_check before insert on public.messages for each row execute function private.validate_media_message();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tungchat-media','tungchat-media',false,2097152,array['image/jpeg','image/webp','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function private.media_object_id(object_name text) returns uuid language plpgsql immutable set search_path='' as $$
begin if object_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' then return null;end if;return split_part(split_part(object_name,'/',2),'.',1)::uuid;exception when others then return null;end $$;
revoke all on function private.media_object_id(text) from public,anon;
grant execute on function private.media_object_id(text) to authenticated;
drop policy if exists tungchat_media_read on storage.objects;
create policy tungchat_media_read on storage.objects for select to authenticated using(bucket_id='tungchat-media' and private.can_read_media(private.media_object_id(name)));
drop policy if exists tungchat_media_upload on storage.objects;
create policy tungchat_media_upload on storage.objects for insert to authenticated with check(bucket_id='tungchat-media' and exists(select 1 from public.chat_media a where a.id=private.media_object_id(storage.objects.name) and a.owner_id=auth.uid() and storage.objects.name=a.owner_id::text||'/'||a.id::text||'.webp'));
commit;
