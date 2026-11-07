# PocketChat 1.3.0 verification

- `node --test test/*.test.cjs`: all seven tests pass, including actual PostgreSQL semantics for group editing/leaving, DM hiding, owner-only moderation RPCs, IP fingerprint matching, raw-IP cleanup, repeatable migrations, existing social/security behavior, and signed updater checks.
- Electron UI tests with a mock Supabase client pass for member-photo group icons, group renaming and picture upload/removal, hiding/reopening DMs, leaving groups, About me editing, own-profile click-through, signup notice acknowledgement, existing friends/blocks, reactions, replies, deletion, privacy mode, and the 800 x 600 layout.
- Visually inspected the profile/settings dialog and the existing chat layout after the changes.
- This source-only update does not include a new Windows installer. Live Supabase Auth/Realtime, deployed Edge Function IP capture, Cron cleanup, and a full Windows install/update have not been exercised against the owner's project.

## 1.6.9 calls — November 4, 2026
- `npm test`: 40 passing tests; call-specific PostgreSQL tests rerun after final signaling validation.
- `electron test/call-ui-electron.cjs`: two local real WebRTC peers with generated audio/video, using the production media permission handlers. Passed no capture before acceptance, bidirectional video/voice, mute, camera off, minimize, remote hangup, decline, sign-out, and permission failure cleanup.
- Full app mock-backend Electron UI passed, including DM call controls at 800px and the existing messaging/game controls.
- Edge Function TypeScript bundled successfully for syntax validation. It has not been deployed or tested against a live TURN provider.
- Windows installer built; ASAR bundle and permission handlers checked against source, release manifest signed and installer SHA-512 verified.
- Live Supabase SQL deployment, real hardware permissions on Windows, and two physical devices on different networks remain deployment checks. No claim of those tests is made.
