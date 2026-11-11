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
replace('row.append(el("strong", g.map), el("span", label(g.host) + " \\xB7 " + g.players + " joined \\xB7 " + g.phase), button(g.joined ? "Open" : "Join game", () => enter2(g.id, !g.joined)));',
  'row.append(el("strong", g.name || g.map), el("span", label(g.host) + " \\xB7 " + g.players + " joined \\xB7 " + g.phase), button(g.joined ? "Open" : "Join game", () => enter2(g.id, !g.joined)));',
  'named lobby browser');
replace('      top.append(button("Controls", controls), button("\\u2190 Open Games", home), el("span", players.filter((p) => p.joined).length + " players"), button("Leave match", () => perform("leave")));',
  '      top.append(button("Controls", controls), button("\\u2190 Open Games", home), el("span", players.filter((p) => p.joined).length + " players"));\n      if (me2.uid === game.host) top.append(button("Close lobby", () => { if (window.confirm("Close this lobby for everyone?")) perform("close"); }));\n      else top.append(button("Leave match", () => perform("leave")));',
  'host persistent lobby close');
replace('        tablet.append(chat, voting);',
  '        if (Array.isArray(data.votes) && data.votes.length) {\n          const summary = el("details", null, "imp-vote-recap");\n          summary.append(el("summary", "Votes cast \\u00b7 " + data.votes.length));\n          for (const vote of data.votes) summary.append(el("p", label(vote.uid) + " voted " + (vote.choice === "skip" ? "to skip" : "for " + label(vote.choice))));\n          chat.append(summary);\n        }\n        tablet.append(chat, voting);',
  'voting recap');
game += '\n  globalThis.CoveImposter3D = Object.freeze({mountImposter});\n})();\n';
const root = path.resolve(__dirname, '..');
fs.writeFileSync(path.join(root, 'imposter-3d-legacy.js'), game);
fs.writeFileSync(path.join(root, 'IMPOSTER-3D-LICENSES.txt'), license);
cp.execFileSync(process.execPath, ['--check', path.join(root, 'imposter-3d-legacy.js')]);
console.log('Recovered original Three.js game from pinned Cove 1.7.0 package (' + game.length + ' characters)');
