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

// Cursor-based catch-up for long disconnections. Caller controls the database
// query, so this can be tested without a live Supabase connection.
export async function fetchMissedMessages(after, fetchPage, mergePage, isCurrent, pageSize = CHAT_CATCHUP_SIZE) {
  let cursor = after, fetched = 0;
  while (isCurrent()) {
    const rows = await fetchPage(cursor, pageSize);
    if (!isCurrent() || !rows.length) return fetched;
    // Guard against backend cursor bugs accidentally producing an infinite loop.
    for (let i = 0; i < rows.length; i++) {
      if (compareMessageCursor(rows[i], i ? rows[i - 1] : cursor) <= 0)
        throw Error('Non-advancing message history cursor');
    }
    await mergePage(rows);
    if (!isCurrent()) return fetched;
    fetched += rows.length;
    cursor = rows.at(-1);
    if (rows.length < pageSize) break;
  }
  return fetched;
}

export function hasOlderMessages(older, cachedNewest, rowsFetched, priorHasOlder, pageSize = CHAT_PAGE_SIZE) {
  // A recent-message check must not erase the cursor for older cached pages.
  return older || !cachedNewest ? rowsFetched === pageSize : priorHasOlder;
}

export function groupAvatarsToRefresh(rooms, cache, now = Date.now()) {
  return rooms.filter(room => room.kind === 'group' &&
    (!cache.has(room.id) || now - (cache.get(room.id)?.at || 0) > 600000))
    .map(room => room.id);
}

export function imposterDiscoveryInterval(rows) {
  // Never delay a joined player's lobby/round auto-open checks. Unjoined
  // accounts only need an occasional game-list badge refresh.
  return Array.isArray(rows) && rows.some(game => game.joined) ? 2500 : 8000;
}

export function needsGameCardReconcile(hasActive, wasActive, lastCheck, now, idleInterval = 45000) {
  return hasActive || wasActive || !lastCheck || now - lastCheck >= idleInterval;
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
    appendMessage(row) {
      if (!row?.room_id) return;
      const entry = cache.get(row.room_id);
      if (!entry) return;
      entry.messages.set(row.id, row);
      entry.parents.set(row.id, row);
      if (entry.messages.size > 200) {
        const first = [...entry.messages.values()].sort(compareMessageCursor)[0];
        entry.messages.delete(first.id);
        if (![...entry.messages.values()].some(m => m.reply_to === first.id)) entry.parents.delete(first.id);
        entry.oldest = [...entry.messages.values()].sort(compareMessageCursor)[0] || null;
        entry.hasOlder = true;
        for (const [key, reaction] of entry.reactions) {
          if (reaction.message_id === first.id) entry.reactions.delete(key);
        }
      }
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

export function createSerialRefresh(work) {
  let active = null, repeat = false;
  return () => {
    if (active) { repeat = true; return active; }
    const request = (async () => {
      do {
        repeat = false;
        await work();
      } while (repeat);
    })();
    const tracked = request.finally(() => { if (active === tracked) active = null; });
    active = tracked;
    return tracked;
  };
}
