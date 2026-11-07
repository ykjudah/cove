function username(value) {
  const result = String(value).trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(result)) throw new Error('Use 3–24 letters, numbers, or underscores for a username.');
  return result;
}
function emailFor(value) { return username(value) + '@users.example.com'; }
function backend(url, key) {
  const parsed = new URL(url.trim());
  if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) || parsed.port || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash)
    throw new Error('Use the project URL from Supabase, such as https://your-project.supabase.co.');
  key = key.trim();
  if (key.startsWith('sb_secret_')) throw new Error('Use a publishable key, never a secret key.');
  if (key.startsWith('eyJ')) {
    let payload;
    try { payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { throw new Error('Invalid legacy anon key.'); }
    if (payload.role !== 'anon') throw new Error('Use the anon key, never the service_role key.');
  } else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error('Paste the Supabase publishable key.');
  return { url: parsed.origin, key };
}
module.exports = { username, emailFor, backend };
