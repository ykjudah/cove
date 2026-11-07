const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expandShortcodes, expandDraft } = require('../src/emoji-shortcuts.cjs');
test('shortcodes convert common aliases, adjacent tokens and mixed case while preserving other text', () => {
  assert.equal(expandShortcodes('hi :smile: :SKULL: :thumbs_up: :heart::fire: :+1: :100:'), 'hi 😃 💀 👍 ❤️🔥 👍 💯');
  assert.equal(expandShortcodes('https://example.com 12:30 :unknown: :unfinished'), 'https://example.com 12:30 :unknown: :unfinished');
  assert.equal(expandShortcodes('line one\n:blue_heart: :rabbit:'), 'line one\n💙 🐰');
});
test('draft replacement keeps the caret and selection aligned with Unicode text', () => {
  assert.deepEqual(expandDraft('hey :skull: later', 11, 16), { value:'hey 💀 later', start:6, end:11 });
  assert.deepEqual(expandDraft('x :heart: :fire:', 2, 2), { value:'x ❤️ 🔥', start:2, end:2 });
  assert.equal(expandDraft(':skull:', 4).start, 2);
});

test('autocomplete matches prefixes and deduplicates emoji',()=>{const {matchShortcodes}=require('../src/emoji-shortcuts.cjs');const rows=matchShortcodes('la');assert.ok(rows.some(r=>r.emoji==='😆'));assert.ok(rows.every(r=>r.name.startsWith('la')));assert.equal(new Set(rows.map(r=>r.emoji)).size,rows.length);assert.deepEqual(matchShortcodes('zzzzzz'),[]);});
