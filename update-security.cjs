const crypto = require('node:crypto');

function repository(value) {
  const parsed = new URL(String(value).trim());
  if (parsed.origin !== 'https://github.com' || parsed.username || parsed.password || parsed.search || parsed.hash)
    throw new Error('Use a public GitHub repository URL: https://github.com/owner/repository');
  const parts = parsed.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_.-]+$/.test(p)) || parts.some(p => p === '.' || p === '..'))
    throw new Error('Use the repository homepage, not a release or file URL.');
  const [owner, repo] = parts;
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}
function manifestPayload(info) {
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(info.version || '') || !Array.isArray(info.files) || info.files.length !== 1)
    throw new Error('Invalid update manifest.');
  const files = info.files.map(f => {
    if (!/^[A-Za-z0-9_.-]+\.exe$/.test(f.url || '') || !/^[A-Za-z0-9+/]{86}==$/.test(f.sha512 || '') || !Number.isSafeInteger(f.size) || f.size <= 0)
      throw new Error('Invalid update file metadata.');
    return { url: f.url, sha512: f.sha512, size: f.size };
  });
  return Buffer.from(JSON.stringify({ version: info.version, files }));
}
function verifyManifest(info, publicKey) {
  if (typeof info.pocketchatSignature !== 'string' || !crypto.verify(null, manifestPayload(info), publicKey, Buffer.from(info.pocketchatSignature, 'base64')))
    throw new Error('Update could not be verified as a Cove release.');
  return true;
}
module.exports = { repository, manifestPayload, verifyManifest };
