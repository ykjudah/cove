begin;
alter table private.activity_log add column if not exists destination text;
alter table private.activity_log add column if not exists destination_kind text;
create index if not exists activity_log_at on private.activity_log(at desc);
revoke all on private.activity_log from public,anon,authenticated;
create or replace function private.audit_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;old_data jsonb;who uuid:=auth.uid();event text;rid uuid;destination_name text;chat_kind text;
begin
row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;old_data:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
if tg_op='UPDATE' and row_data=old_data then return new;end if;
if tg_table_name='rooms' and tg_op='UPDATE' and (row_data-'last_activity_at')=(old_data-'last_activity_at') then return new;end if;
if tg_table_name='messages' then
 event:=case when tg_op='INSERT' then 'Sent a message' when tg_op='DELETE' or row_data->>'deleted_at' is distinct from old_data->>'deleted_at' then 'Deleted a message' else 'Edited a message' end;
 who:=coalesce(who,(row_data->>'sender_id')::uuid);
elsif tg_table_name='room_members' then event:=case when tg_op='INSERT' then 'Joined or added to a chat' else 'Left or removed from a chat' end;who:=coalesce(who,(row_data->>'user_id')::uuid);
elsif tg_table_name='profiles' then event:=case when tg_op='INSERT' then 'Account created' when tg_op='DELETE' then 'Account deleted' else 'Profile updated' end;who:=coalesce(who,(row_data->>'id')::uuid);
elsif tg_table_name='rooms' then event:='Chat '||lower(tg_op);
elsif tg_table_name='chat_media' then event:=case when tg_op='INSERT' then 'Uploaded '||coalesce(row_data->>'kind','media') else 'Updated media collection' end;
elsif tg_table_name='friendships' then event:='Friendship '||case when tg_op='DELETE' then 'removed' else coalesce(row_data->>'status','updated') end;
elsif tg_table_name='user_blocks' then event:=case when tg_op='DELETE' then 'Unblocked an account' else 'Blocked an account' end;
elsif tg_table_name='message_reactions' then event:=case when row_data->>'active'='false' or tg_op='DELETE' then 'Removed a reaction' else 'Reacted to a message' end;
elsif tg_table_name='hidden_rooms' then event:=case when tg_op='INSERT' then 'Closed a DM' else 'Reopened a DM' end;
elsif tg_table_name='emoji_collection' then event:=case when tg_op='INSERT' then 'Saved a custom emoji' else 'Removed a custom emoji' end;
elsif tg_table_name='app_admins' then event:=case when tg_op='INSERT' then 'Granted moderation access' else 'Removed moderation access' end;
elsif tg_table_name='live_calls' then
 if tg_op='UPDATE' and row_data->>'ended_at' is not distinct from old_data->>'ended_at' then return new;end if;
 event:=case when tg_op='INSERT' then 'Started a call' else 'Call closed' end;who:=case when tg_op='INSERT' then (row_data->>'creator')::uuid else null end;
elsif tg_table_name='live_call_members' then
 if tg_op='UPDATE' and row_data->>'status' is not distinct from old_data->>'status' then return new;end if;
 if row_data->>'status'='invited' then return new;end if;
 event:=case when row_data->>'status'='joined' then 'Joined a call' else 'Call participation ended' end;who:=(row_data->>'user_id')::uuid;
else
 if tg_op='UPDATE' and row_data->>'revision' is not distinct from old_data->>'revision' and row_data->>'player2' is not distinct from old_data->>'player2' then return new;end if;
 event:=replace(tg_table_name,'_',' ')||' '||case when tg_op='INSERT' then 'invited' else 'played' end;
end if;
rid:=nullif(row_data->>'room_id','')::uuid;
if rid is not null then
 select r.kind,case when r.kind='group' then r.name else
 (select string_agg(p.username,', ' order by p.username) from public.room_members m join public.profiles p on p.id=m.user_id
 where m.room_id=rid and m.user_id is distinct from coalesce(nullif(row_data->>'sender_id','')::uuid,who)) end
 into chat_kind,destination_name from public.rooms r where r.id=rid;
end if;
insert into private.activity_log(actor,username,action,room_id,object_id,destination,destination_kind)
values(who,(select username from public.profiles where id=who),event,rid,coalesce(row_data->>'id',row_data->>'call_id'),destination_name,chat_kind);
delete from private.activity_log where at<now()-interval '30 days';return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.audit_activity() from public,anon,authenticated;

-- Older events use available current chat names. New events preserve names at the event time.
update private.activity_log l set destination_kind=r.kind,destination=case when r.kind='group' then r.name else
(select string_agg(p.username,', ' order by p.username) from public.room_members m join public.profiles p on p.id=m.user_id where m.room_id=r.id and m.user_id is distinct from l.actor) end
from public.rooms r where l.room_id=r.id and l.destination is null;
commit;
