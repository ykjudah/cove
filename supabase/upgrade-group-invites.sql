begin;
create or replace function public.add_group_member(target_room uuid,other_username text) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if auth.uid() is null or not private.is_member(target_room) or not exists(select 1 from public.rooms where id=target_room and kind='group') then raise exception 'Group unavailable';end if;
 select id into target from public.profiles where lower(username)=lower(btrim(other_username));
 if target is null then raise exception 'No account with that username';end if;
 if exists(select 1 from public.room_members m where m.room_id=target_room and private.people_blocked(target,m.user_id)) then raise exception 'This person cannot be added to this group';end if;
 insert into public.room_members(room_id,user_id) values(target_room,target) on conflict do nothing;
end $$;
revoke all on function public.add_group_member(uuid,text) from public,anon;
grant execute on function public.add_group_member(uuid,text) to authenticated;
commit;
