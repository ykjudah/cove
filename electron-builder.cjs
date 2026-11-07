const pkg = require('./package.json');
const { repository } = require('./update-security.cjs');
const release = require('./release-config.json');
const source = process.env.POCKETCHAT_UPDATE_REPO || release.repository;
const publish = source
  ? (() => { const r = repository(source); return [{ provider: 'github', owner: r.owner, repo: r.repo, releaseType: 'release' }]; })()
  : [{ provider: 'generic', url: 'https://updates.invalid/pocketchat/' }];
// The .invalid placeholder only generates update metadata; the app never checks
// for updates until its owner supplies a real GitHub repository in Settings.
module.exports = { ...pkg.build, extraMetadata: { pocketchatUpdateRepository: source || '' }, publish };
