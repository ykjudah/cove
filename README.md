# Cove

A Windows 10/11 desktop messenger backed by Supabase. It includes private direct and group chats, message history, replies, reactions, author-only message deletion, friends and blocks, profile pictures and About me, group pictures, quiet in-app notifications, typing indicators, and offline `:emojiname:` shortcuts. Group members can rename groups, change their picture, and leave. Direct messages can be hidden without deleting shared history. Groups without a custom picture show the current members' profile pictures. The right-side profile/member viewer has been removed.

See [START-HERE.md](START-HERE.md) for current development and release instructions. The existing app identity, saved settings, and database identifiers remain compatible with earlier installations.

Type `:smile:`, `:skull:`, `:heart:`, or `:thumbs_up:` in the message box to insert emoji. GIF search has been removed; older GIF messages display text placeholders. Typing status appears above the composer on the left.

The controller button opens Games. Send an 8-ball invitation into any chat; the first other member to accept becomes your opponent. See POOL-NOTES.md for rules, saved-state details, and test coverage.

## Build

```sh
npm ci
npm test
npm run dist
```

The Windows x64 per-user installer is generated under `dist/`. It does not request administrator elevation. The app is not Authenticode-signed, so Windows may show an unknown-publisher warning. See `RELEASES.md` for signed update hosting. Do not commit private signing keys or GitHub tokens.

## Backend and privacy

The project owner can read stored messages; messages are not end-to-end encrypted. The optional moderation panel stores IP observations for up to 7 days and keyed overlap codes for up to 90 days. A shared IP may mean a shared home, school, workplace, carrier, VPN, or public network; it is only a possible match, not proof of alternate accounts. IP moderation requires the authenticated `record-session-ip` Edge Function, `IP_MATCH_SECRET`, and Supabase Cron.

Typing indicators use private Supabase Realtime broadcasts with server-side membership checks. Emoji shortcuts work locally without a GIF provider. See [PRIVACY.md](PRIVACY.md).

## Tests

`npm test` exercises database policies using PGlite and tests privacy, the updater trust boundary, and emoji shortcode conversion. The Electron UI test uses a mock Supabase backend. Real hosted authentication/realtime, and Windows update installation require trying the app with the configured services.

## Current limits

Hosted authentication, calls, storage, and realtime must be checked against the deployed Supabase project; local tests do not verify that deployment. Name hiding, notification preference, and appearance are local to each computer.
