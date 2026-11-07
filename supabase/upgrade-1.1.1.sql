-- PocketChat 1.1.1: run after upgrade-1.1.sql, before publishing the update.
-- Safe to rerun; existing messages and reactions are preserved.
begin;
alter table public.message_reactions drop constraint if exists message_reactions_emoji_check;
alter table public.message_reactions add constraint message_reactions_emoji_check check (emoji in ('😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😎', '🤓', '🥳', '🤩', '🤔', '🫡', '🤨', '😐', '😑', '🙄', '😏', '😮', '😲', '😳', '🥺', '🥹', '😢', '😭', '😤', '😡', '🤯', '😱', '😴', '🤤', '🤢', '🤮', '🤡', '💀', '👻', '👽', '🤖', '💩', '👍', '👎', '👏', '🙌', '👐', '🤝', '🙏', '💪', '👊', '✊', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '👋', '🫶', '👀', '🧠', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💖', '🔥', '✨', '⭐', '🌟', '💯', '✅', '❌', '❓', '❗', '🎉', '🎊', '🎂', '🎁', '🏆', '🥇', '🚀', '⚡', '☀️', '🌙', '🌈', '🍀', '🌹', '🐱', '🐶', '🐰', '🐸', '🦆', '🦋', '🍕', '🍔', '🍿', '☕', '🎮', '🎵', '📸', '🗿'));
create or replace function public.toggle_reaction(target_message uuid, reaction text) returns public.message_reactions
language plpgsql security definer set search_path = '' as $$
declare target public.messages; result public.message_reactions;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if reaction is null or reaction not in ('😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😎', '🤓', '🥳', '🤩', '🤔', '🫡', '🤨', '😐', '😑', '🙄', '😏', '😮', '😲', '😳', '🥺', '🥹', '😢', '😭', '😤', '😡', '🤯', '😱', '😴', '🤤', '🤢', '🤮', '🤡', '💀', '👻', '👽', '🤖', '💩', '👍', '👎', '👏', '🙌', '👐', '🤝', '🙏', '💪', '👊', '✊', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '👋', '🫶', '👀', '🧠', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💖', '🔥', '✨', '⭐', '🌟', '💯', '✅', '❌', '❓', '❗', '🎉', '🎊', '🎂', '🎁', '🏆', '🥇', '🚀', '⚡', '☀️', '🌙', '🌈', '🍀', '🌹', '🐱', '🐶', '🐰', '🐸', '🦆', '🦋', '🍕', '🍔', '🍿', '☕', '🎮', '🎵', '📸', '🗿') then
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
revoke all on function public.toggle_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;
commit;
