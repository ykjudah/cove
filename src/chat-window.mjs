// Reusable, account-scoped chat window state. Never persist messages to disk.
export const CHAT_PAGE_SIZE = 50;
export const CHAT_CATCHUP_SIZE = 100;

export function compareMessageCursor(a, b) {
  const time = String(a.created_at).localeCompare(String(b.created_at));
  return time || String(a.id).localeCompare(String(b.id));
}

export function newestMessage(values) {
  let newest = null;
  for (const value of values) {
    if (!newest || compareMessageCursor(value, newest) > 0) newest = value;
  }
  return newest;
}

export function olderMessage(a, b) {
  if (!a) return b;
  if (!b) return a;
  return compareMessageCursor(a, b) <= 0 ? a : b;
}

export function createConversationCache(capacity = 5) {
  const cache = new Map();
  return {
    get(roomId) {
      const value = cache.get(roomId);
      if (!value) return null;
      cache.delete(roomId);
      cache.set(roomId, value);
      return value;
    },
    set(roomId, value) {
      if (cache.has(roomId)) cache.delete(roomId);
      cache.set(roomId, value);
      while (cache.size > capacity) cache.delete(cache.keys().next().value);
    },
    updateMessage(row) {
      if (!row?.room_id) return;
      const entry = cache.get(row.room_id);
      if (!entry) return;
      if (entry.messages.has(row.id)) entry.messages.set(row.id, row);
      if (entry.parents.has(row.id)) entry.parents.set(row.id, row);
    },
    updateReaction(row) {
      if (!row?.message_id) return;
      for (const entry of cache.values()) {
        if (!entry.messages.has(row.message_id)) continue;
        const key = row.message_id + ':' + row.user_id + ':' + row.emoji;
        const existing = entry.reactions.get(key);
        if (!existing || existing.updated_at <= row.updated_at) entry.reactions.set(key, row);
      }
    },
    delete(roomId) { cache.delete(roomId); },
    clear() { cache.clear(); },
    get size() { return cache.size; }
  };
}
