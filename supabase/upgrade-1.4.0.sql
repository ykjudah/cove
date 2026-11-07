-- PocketChat 1.4.0. Run once after upgrade-1.3.1.sql.
-- Typing events use private Supabase Realtime channels scoped to group membership.
begin;

drop policy if exists pocketchat_typing_receive on realtime.messages;
drop policy if exists pocketchat_typing_send on realtime.messages;

create policy pocketchat_typing_receive
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) ~ '^pocketchat-typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_member(substring((select realtime.topic()) from 19)::uuid)
);

create policy pocketchat_typing_send
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and (select realtime.topic()) ~ '^pocketchat-typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_member(substring((select realtime.topic()) from 19)::uuid)
);

commit;
