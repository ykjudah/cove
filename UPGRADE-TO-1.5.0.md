# TungChat 1.5.0 — update instructions

1. Extract `TungChat-1.5.0-Update.zip`.
2. In Supabase → SQL Editor → New query, paste the contents of `TungChat-upgrade-1.5.0.sql` and click Run. This is for your existing 1.4.0 database. It adds saved games and invitations. No new keys, Storage buckets, or Edge Functions are required.
3. Open your existing GitHub updates repository. Create a release with tag `v1.5.0` and title `TungChat 1.5.0`.
4. Drag all THREE files from `release-files` into the release: the Setup EXE, its blockmap, and `latest.yml`. Do not rename or edit them. Publish the release.
5. In the installed app, open Settings → Updates → Check for updates, then restart when offered. Friends do the same. Keep using the same update repository.

The rename keeps the existing application ID and user-data folder. The private update signing key is not included. The source ZIP is for editing; do not upload it in place of the three release files.

## Update notes

- PocketChat is now TungChat.
- Removed KLIPY GIF search and its key settings; old GIF messages remain as text placeholders.
- Type shortcuts such as `:smile:`, `:heart:`, `:skull:`, and `:thumbsup:` to insert emojis.
- Typing indicators sit above the message box on the left, with spaced animation dots.
- Added a controller button opening Games.
- Send an 8-ball invitation into a chat. Anyone else there can accept; the first acceptance claims the opponent slot.
- Added a portrait pool table, aiming guide, power meter, turn rules, ball-in-hand, saved matches, shot replay, and rematches.

## Quick check after updating

Send a game in a chat with a friend. Have the friend accept, take a shot, then close and reopen the game on both devices. Confirm the same table and active player are restored. Test the update on your own Windows installation before asking everyone else to install.

Local automated database and UI tests passed. A live two-device deployment and Windows in-place upgrade have not been tested here. Pool is a casual friends game: clients simulate shots; the server checks access and turn ownership but does not independently verify the physics result.
