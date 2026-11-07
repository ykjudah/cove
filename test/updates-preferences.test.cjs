const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { repository, manifestPayload, verifyManifest } = require('../update-security.cjs');
const { accent, accentInk, hideNames } = require('../src/preferences.cjs');

test('accent colors and privacy modes keep readable colors and scope aliases correctly', () => {
  assert.equal(accent('#AABBCC'), '#aabbcc');
  assert.equal(accent('red; background: url(https://evil.test)'), '#20b8c9');
  assert.equal(accentInk('#000000'), '#ffffff');
  assert.equal(accentInk('#ffffff'), '#10140e');
  assert.equal(hideNames('current', 'one', 'one'), true);
  assert.equal(hideNames('current', 'two', 'one'), true);
  assert.equal(hideNames('all', 'two', 'one'), true);
  assert.equal(hideNames('off', 'one', 'one'), false);
});

test('update sources are GitHub repositories, and update signatures bind version, path, hash, and size', () => {
  assert.equal(repository('https://github.com/owner/pocketchat/').url, 'https://github.com/owner/pocketchat');
  for (const value of ['http://github.com/owner/app','https://github.com.evil.test/owner/app','https://github.com/owner/app/releases','https://user:pass@github.com/owner/app','https://github.com/owner/app?token=secret'])
    assert.throws(() => repository(value));
  const key = crypto.generateKeyPairSync('ed25519');
  const info = { version: '1.2.0', files: [{ url: 'PocketChat-1.2.0-Setup-x64.exe', sha512: crypto.createHash('sha512').update('installer').digest('base64'), size: 123 }] };
  info.pocketchatSignature = crypto.sign(null, manifestPayload(info), key.privateKey).toString('base64');
  assert.equal(verifyManifest(info,key.publicKey),true);
  const mutations = [i=>i.version='9.0.0',i=>i.files[0].url='other.exe',i=>i.files[0].sha512=crypto.createHash('sha512').update('other').digest('base64'),i=>i.files[0].size=124];
  for (const mutate of mutations) { const changed=structuredClone(info);mutate(changed);assert.throws(()=>verifyManifest(changed,key.publicKey)); }
  assert.throws(()=>verifyManifest({...info,pocketchatSignature:''},key.publicKey));
  assert.throws(()=>verifyManifest(info,crypto.generateKeyPairSync('ed25519').publicKey));
  assert.throws(()=>manifestPayload({...info,files:[{...info.files[0],url:'https://evil.test/app.exe'}]}));
});
