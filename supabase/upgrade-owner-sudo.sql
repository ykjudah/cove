begin;
create table if not exists private.sudo_audit(
 request_id uuid primary key,
 owner_id uuid not null,
 target_id uuid not null,
 room_id uuid not null,
 message_id uuid not null,
 created_at timestamptz not null default now()
);
revoke all on private.sudo_audit from public,anon,authenticated;
create or replace function public.owner_sudo(target_room uuid,target_username text,message_text text,request_id uuid) returns public.messages
language plpgsql security definer set search_path='' as $$
declare target uuid;result public.messages;old private.sudo_audit;
begin
 if auth.uid() is null or not public.is_app_owner() then raise exception 'Owner access required';end if;
 if request_id is null or not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
 select id into target from public.profiles where username=lower(ltrim(target_username,'@'));
 if target is null or not exists(select 1 from public.room_members where room_id=target_room and user_id=target) then raise exception 'Choose someone in this chat';end if;
 if message_text is null or char_length(btrim(message_text)) not between 1 and 4000 or message_text like '[[tungchat-%' or message_text like '[[sahur-%' then raise exception 'Enter a plain text message (up to 4000 characters)';end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into old from private.sudo_audit a where a.request_id=owner_sudo.request_id;
 if found then
  if old.owner_id<>auth.uid() or old.target_id<>target or old.room_id<>target_room then raise exception 'Request already used';end if;
  select * into result from public.messages where id=old.message_id;return result;
 end if;
 if exists(select 1 from public.room_members m where m.room_id=target_room and private.people_blocked(target,m.user_id)) then raise exception 'Messaging is unavailable for this person';end if;
 insert into public.messages(room_id,sender_id,body) values(target_room,target,btrim(message_text)) returning * into result;
 insert into private.sudo_audit(request_id,owner_id,target_id,room_id,message_id) values(request_id,auth.uid(),target,target_room,result.id);
 return result;
end $$;
revoke all on function public.owner_sudo(uuid,text,text,uuid) from public,anon;
grant execute on function public.owner_sudo(uuid,text,text,uuid) to authenticated;
commit;
