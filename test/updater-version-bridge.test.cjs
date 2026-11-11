const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('app and lockfile use the same internal updater version', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});

test('updater exposes the installed binary version separately from Cove branding', () => {
  const main = read('main.cjs');
  const ui = read('src/app.js');
  assert.match(main, /installedVersion: app\.getVersion\(\)/);
  assert.match(ui, /state\.installedVersion/);
  assert.match(main, /Cove is up to date \(installed/);
});
