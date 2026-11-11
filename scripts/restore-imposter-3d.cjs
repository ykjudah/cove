'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

// Original Windows Cove 1.7.0 installation, internal build 2.7.0.
// Pin the recovered archive so future builds never silently change 3D code.
const EXPECTED_SHA256 = '1284c42e6b748f42366fdb3820281a8a7ad41e22a2f06a52b85ae810e663a503';
const original = process.argv[2];
if (!original || !fs.existsSync(original)) {
  throw Error('Usage: node scripts/restore-imposter-3d.cjs PATH_TO_VERIFIED_app.asar');
}
const packed = fs.readFileSync(original);
const hash = crypto.createHash('sha256').update(packed).digest('hex');
if (hash !== EXPECTED_SHA256) throw Error('Wrong archived Cove build (sha256 ' + hash + '). Refusing unverified code.');

function archiveFile(target) {
  if (packed.length < 20) throw Error('Invalid asar');
  const pickle = packed.readUInt32LE(4), headerSize = packed.readUInt32LE(12);
  if (pickle < 8 || headerSize > 2 ** 22 || headerSize < 2) throw Error('Invalid asar header');
  const header = JSON.parse(packed.subarray(16, 16 + headerSize).toString('utf8'));
  let entry = header;
  for (const part of target.split('/')) entry = entry?.files?.[part];
  if (!entry || entry.unpacked || !Number.isSafeInteger(entry.size) || !/^\d+$/.test(entry.offset))
    throw Error('Missing archive file: ' + target);
  const begin = 8 + pickle + Number(entry.offset), end = begin + entry.size;
  if (end > packed.length) throw Error('Truncated ASAR archive');
  return packed.subarray(begin, end);
}
const oldBundle = archiveFile('app.js').toString('utf8');
const license = archiveFile('IMPOSTER-3D-LICENSES.txt');
const originalStyles = archiveFile('style.css').toString('utf8');
const legacyCss = originalStyles.split(/\r?\n/).slice(451).join('\n');
if (!legacyCss.includes('.imp-wardrobe-panel') || !legacyCss.includes('.imp-wire-board') || !legacyCss.includes('.imp-meeting-tablet'))
  throw Error('Original 3D game CSS is missing or changed');
const cut = oldBundle.indexOf('  // src/app.js');
if (cut < 0 || !oldBundle.startsWith('(() => {') ||
  !oldBundle.includes('function createScene3D(') || !oldBundle.includes('function mountImposter('))
  throw Error('Authentic Three.js Imposter module markers not found');
let game = oldBundle.slice(0, cut);
function replace(oldText, newText, note) {
  const pos = game.indexOf(oldText);
  if (pos < 0 || game.indexOf(oldText, pos + oldText.length) >= 0)
    throw Error('Unexpected original 3D game code: ' + note);
  game = game.slice(0, pos) + newText + game.slice(pos + oldText.length);
}
// Retain predicted movement when the authoritative server has not yet
// accepted a batch. The older 3D client incorrectly discarded those steps.
replace('          if (ack.epoch != null && ack.epoch !== epoch2) {',
  '          if (ack.revision === packet.revision) return;\n          if (ack.epoch != null && ack.epoch !== epoch2) {',
  'movement reconciliation');
// The new backend reuses the lobby after a round; do not delete it on cleanup.
replace('          await perform("cleanup");\n          home();',
  '          finishTimer = null;\n          await perform("read");',
  'persistent lobby after results');
replace('Returning to Open Games in ', 'Returning to the ship in ', 'result description');
replace('        if (act === "leave" || act === "cleanup") {',
  '        if (act === "leave" || act === "cleanup" || act === "close") {',
  'close lobby return to game browser');
replace('row.append(el("strong", g.map), el("span", label(g.host) + " \\xB7 " + g.players + " joined \\xB7 " + g.phase), button(g.joined ? "Open" : "Join game", () => enter2(g.id, !g.joined)));',
  'row.append(el("strong", g.name || g.map), el("span", label(g.host) + " \\xB7 " + g.players + " joined \\xB7 " + g.phase), button(g.joined ? "Open" : "Join game", () => enter2(g.id, !g.joined)));',
  'named lobby browser');
replace('      top.append(button("Controls", controls), button("\\u2190 Open Games", home), el("span", players.filter((p) => p.joined).length + " players"), button("Leave match", () => perform("leave")));',
  '      top.append(button("Controls", controls), button("\\u2190 Open Games", home), el("span", players.filter((p) => p.joined).length + " players"));\n      if (me2.uid === game.host) top.append(button("Close lobby", () => { if (window.confirm("Close this lobby for everyone?")) perform("close"); }));\n      else top.append(button("Leave match", () => perform("leave")));',
  'host persistent lobby close');
replace('        tablet.append(chat, voting);',
  '        if (Array.isArray(data.votes) && data.votes.length) {\n          const summary = el("details", null, "imp-vote-recap");\n          summary.append(el("summary", "Votes cast \\u00b7 " + data.votes.length));\n          for (const vote of data.votes) summary.append(el("p", label(vote.uid) + " voted " + (vote.choice === "skip" ? "to skip" : "for " + label(vote.choice))));\n          chat.append(summary);\n        }\n        tablet.append(chat, voting);',
  'voting recap');
// Preserve newer named persistent lobbies and cooldown configuration.
replace('option("Vent cooldown (seconds)", [0, 5, 10, 15, 20, 30, 45, 60, 90], current.vent_cooldown ?? 15)\n      ];',
  'option("Vent cooldown (seconds)", [0, 5, 10, 15, 20, 30, 45, 60, 90], current.vent_cooldown ?? 15),\n        option("Meeting cooldown (seconds)", [10, 20, 30, 45, 60, 90, 120], current.meeting_cooldown ?? 30)\n      ];',
  'meeting cooldown');
replace('      form.append(...fields.map((f) => f[0]));',
  '      const nameInput = el("input"); nameInput.value = current.name || "My Imposter Lobby"; nameInput.maxLength = 40;\n      const nameField = el("label", "Lobby name"); nameField.append(nameInput);\n      form.append(nameField, ...fields.map((f) => f[0]));',
  'lobby name');
replace('await perform("configure", JSON.stringify({ map: v[0], imposters: +v[1], cooldown: +v[2], tasks: +v[3], vote_seconds: +v[4], vent_cooldown: +v[5] }));',
  'await perform("configure", JSON.stringify({ map: v[0], imposters: +v[1], cooldown: +v[2], tasks: +v[3], vote_seconds: +v[4], vent_cooldown: +v[5], meeting_cooldown: +v[6], name: nameInput.value.trim() }));',
  'editing lobby');
replace('const id = await rpc("imp_create", { map_name: v[0], imposters: +v[1], cooldown: +v[2], task_count: +v[3], vote_seconds: +v[4] });',
  'const id = await rpc("imp_create", { map_name: v[0], imposters: +v[1], cooldown: +v[2], task_count: +v[3], vote_seconds: +v[4], lobby_name: nameInput.value.trim(), meeting_cooldown_seconds: +v[6] });',
  'new named lobby');
replace('if (+v[5] !== 15) await rpc("imp_action", { game_id: id, act: "configure", arg: JSON.stringify({ map: v[0], imposters: +v[1], cooldown: +v[2], tasks: +v[3], vote_seconds: +v[4], vent_cooldown: +v[5] }) });',
  'if (+v[5] !== 15) await rpc("imp_action", { game_id: id, act: "configure", arg: JSON.stringify({ map: v[0], imposters: +v[1], cooldown: +v[2], tasks: +v[3], vote_seconds: +v[4], vent_cooldown: +v[5], meeting_cooldown: +v[6], name: nameInput.value.trim() }) });',
  'creation vent settings');
replace('body.append(el("h3", "Lobby"), el("p", game.imposters',
  'body.append(el("h3", "Lobby · " + (game.name || game.map)), el("p", game.imposters',
  'lobby heading');
replace('      const stage2 = makeStage(data);',
  '      if (me2.uid === game.host) {\n        const management = el("details", null, "imp-kick-list"); management.append(el("summary", "Manage crew"));\n        for (const p of players.filter(p => p.uid !== me2.uid && p.joined)) {\n          const row = el("div", null, "imp-row");\n          row.append(el("span", label(p.uid)), button("Kick", () => { if (window.confirm("Kick " + label(p.uid) + " from this lobby?")) perform("kick", p.uid); }));\n          management.append(row);\n        }\n        body.append(management);\n      }\n      const stage2 = makeStage(data);',
  'host kicks');

// Newer Cove can directly open an active round by game ID.
replace('    return { open() {\n      if (!user()) return;\n      dialog.showModal();\n      home();\n      listTimer = setInterval(read, 600);\n    }, close };',
  '    return { open(id = null) {\n      if (!user()) return;\n      if (!dialog.open) dialog.showModal();\n      if (id) enter2(id, false); else home();\n      clearInterval(listTimer);\n      listTimer = setInterval(read, 600);\n    }, close };',
  'direct round invitation');

game += '\n  globalThis.CoveImposter3D = Object.freeze({mountImposter});\n})();\n';
const root = path.resolve(__dirname, '..');
fs.writeFileSync(path.join(root, 'imposter-3d-legacy.js'), game);
fs.writeFileSync(path.join(root, 'IMPOSTER-3D-LICENSES.txt'), license);
fs.writeFileSync(path.join(root, 'imposter-3d-legacy.css'), legacyCss);
cp.execFileSync(process.execPath, ['--check', path.join(root, 'imposter-3d-legacy.js')]);
console.log('Recovered original Three.js game from pinned Cove 1.7.0 package (' + game.length + ' characters)');
