const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { checkForAvailableUpdate } = require('../updater-check.cjs');

function mockUpdater(event, result = { updateInfo: { version: '2.3.3' } }) {
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => {
    if (event) updater.emit(event, result.updateInfo);
    return result;
  };
  return updater;
}

test('detects available release without nonexistent isUpdateAvailable property', async () => {
  const updater = mockUpdater('update-available');
  const decision = await checkForAvailableUpdate(updater);
  assert.equal(decision.available, true);
  assert.equal(decision.result.updateInfo.version, '2.3.3');
  assert.equal(updater.listenerCount('update-available'), 0);
});

test('declines when the updater emits update-not-available', async () => {
  const updater = mockUpdater('update-not-available');
  const decision = await checkForAvailableUpdate(updater);
  assert.equal(decision.available, false);
  assert.equal(updater.listenerCount('update-available'), 0);
});

test('does not report a downloadable update without check result', async () => {
  const updater = mockUpdater('update-available', null);
  updater.checkForUpdates = async () => {
    updater.emit('update-available', { version: '2.3.3' });
    return null;
  };
  assert.equal((await checkForAvailableUpdate(updater)).available, false);
});

test('removes listener even when checking fails', async () => {
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => { throw Error('offline'); };
  await assert.rejects(checkForAvailableUpdate(updater), /offline/);
  assert.equal(updater.listenerCount('update-available'), 0);
});

test('packaged Windows app includes the updater check helper', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.ok(pkg.build.files.includes('updater-check.cjs'));
  const main = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
  assert.match(main, /checkForAvailableUpdate\(updater\)/);
  assert.doesNotMatch(main, /result\.isUpdateAvailable/);
});
