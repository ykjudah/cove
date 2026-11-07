begin;
create table if not exists public.emoji_collection(user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,media_id uuid not null references public.chat_media(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,media_id));
create table if not exists private.message_emoji_refs(message_id uuid references public.messages(id) on delete cascade,media_id uuid references public.chat_media(id) on delete cascade,primary key(message_id,media_id));
revoke all on private.message_emoji_refs from public,anon,authenticated;
alter table public.emoji_collection enable row level security;
revoke all on public.emoji_collection from public,anon,authenticated;
create or replace function private.can_read_media(media_id uuid) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.chat_media a where a.id=media_id and (a.owner_id=auth.uid() or (not private.people_blocked(auth.uid(),a.owner_id) and (exists(select 1 from public.emoji_collection e where e.user_id=auth.uid() and e.media_id=a.id) or exists(select 1 from public.messages m where m.deleted_at is null and private.is_member(m.room_id) and (m.body='[[tungchat-media:v1]]'||a.id::text or (a.kind='emoji' and exists(select 1 from private.message_emoji_refs r where r.message_id=m.id and r.media_id=a.id)))))))) $$;
create or replace function public.save_custom_emoji(emoji_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
if auth.uid() is null or not private.can_read_media(emoji_id) or not exists(select 1 from public.chat_media where id=emoji_id and kind='emoji') then raise exception 'Emoji unavailable';end if;
insert into public.emoji_collection(user_id,media_id) values(auth.uid(),emoji_id) on conflict do nothing;end $$;
create or replace function public.my_custom_emojis() returns setof public.chat_media language sql stable security definer set search_path='' as $$ select a.* from public.chat_media a where a.kind='emoji' and ((a.owner_id=auth.uid() and not a.archived) or exists(select 1 from public.emoji_collection e where e.user_id=auth.uid() and e.media_id=a.id)) and private.can_read_media(a.id) order by a.created_at desc $$;
create or replace function public.remove_custom_emoji(emoji_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 delete from public.emoji_collection where user_id=auth.uid() and media_id=emoji_id;
 update public.chat_media set archived=true where id=emoji_id and owner_id=auth.uid() and kind='emoji';end $$;
create or replace function private.validate_media_message() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.chat_media;media_id uuid;match text[];
begin
 if new.body like '[[tungchat-media:v1]]%' then
 begin media_id:=substring(new.body from char_length('[[tungchat-media:v1]]')+1)::uuid;exception when others then raise exception 'Invalid image';end;
 select * into a from public.chat_media where id=media_id;
 if a.id is null or not ((a.owner_id=auth.uid() and not a.archived) or (a.kind='emoji' and exists(select 1 from public.emoji_collection e where e.user_id=auth.uid() and e.media_id=a.id))) or (a.kind='image' and a.room_id<>new.room_id) or not private.can_read_media(a.id) then raise exception 'Image unavailable';end if;
 end if;
 for match in select regexp_matches(new.body,'\[\[emoji:([0-9a-f-]{36})\]\]','g') loop
 select * into a from public.chat_media where id=match[1]::uuid;
 if a.id is null or a.kind<>'emoji' or not private.can_read_media(a.id) or not ((a.owner_id=auth.uid() and not a.archived) or exists(select 1 from public.emoji_collection e where e.user_id=auth.uid() and e.media_id=a.id)) then raise exception 'Save this emoji to your collection first';end if;
 end loop;return new;
end $$;
create or replace function private.link_message_emojis() returns trigger language plpgsql security definer set search_path='' as $$begin
 delete from private.message_emoji_refs where message_id=new.id;
 insert into private.message_emoji_refs select new.id,match[1]::uuid from regexp_matches(new.body,'\[\[emoji:([0-9a-f-]{36})\]\]','g') match on conflict do nothing;return new;end $$;
revoke all on function private.link_message_emojis() from public,anon,authenticated;
drop trigger if exists link_message_emojis on public.messages;create trigger link_message_emojis after insert or update of body on public.messages for each row execute function private.link_message_emojis();
drop trigger if exists message_media_check on public.messages;
create trigger message_media_check before insert or update of body on public.messages for each row execute function private.validate_media_message();
revoke all on function public.save_custom_emoji(uuid),public.my_custom_emojis(),public.remove_custom_emoji(uuid) from public,anon;
grant execute on function public.save_custom_emoji(uuid),public.my_custom_emojis(),public.remove_custom_emoji(uuid) to authenticated;
commit;
