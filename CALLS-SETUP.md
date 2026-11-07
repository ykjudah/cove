# Voice and video calls — Cove 1.6.12

## The regular update
1. In Supabase SQL Editor, run the included **SahurChat-upgrade-1.6.12.sql** once.
2. Upload the three files inside **release-files** to your GitHub release tagged **v1.6.12**. Do not rename them.
3. Everyone updates Cove and signs in. Open a DM or group and click the camera or phone. Other members click **Accept** or **Join call**. Every eligible chat member can join. Incoming invitations appear while the app is running.
4. Allow the system camera/microphone permission if asked. Windows: Settings → Privacy & security → Camera/Microphone → allow desktop apps. A voice call needs only a microphone.

This is enough to try direct calls. Some networks require the relay below. School/work network restrictions may still prevent calls; this does not bypass their policies.

## Reliable calls across networks: configure a relay once
The relay is separate from Supabase. Friends do not enter keys or configure anything.

1. In Cloudflare, open **Realtime → TURN**, create a TURN key, and copy its **Key ID** and **API Token**. Follow https://developers.cloudflare.com/realtime/turn/generate-credentials/ if the dashboard wording differs. Review the provider's current usage charges before enabling it.
2. Open your Supabase project → **Edge Functions → Secrets**. Add:
   - `TURN_KEY_ID` = your TURN key ID
   - `TURN_KEY_API_TOKEN` = its API token
   Keep these secrets out of GitHub releases and the app's source.
3. Extract the included **SahurChat-1.6.12-Source.zip**. Open Terminal in the extracted folder containing `package.json` and `supabase`.
4. Run `npx supabase login` if the CLI is not already signed in.
5. Run `npx supabase functions deploy call-ice --project-ref YOUR_PROJECT_REF`, replacing `YOUR_PROJECT_REF` with the project reference from your Supabase dashboard URL (`/project/THIS_PART/`).
6. Start a new call. Its connection note should now say **Relay available**. Test with two devices on different networks, for example home Wi-Fi and a phone hotspot.

The function verifies the signed-in user and accepted call, rate-limits credential requests per participant, then returns a two-hour temporary TURN credential. No service-role key is embedded in the app. Without the function or its secrets, calls try a direct STUN connection and display a setup hint if they cannot connect.

## Cleanup and controls
- Enable **Cron** in Supabase, then rerun the SQL so unattended call cleanup runs every minute. No storage bucket changes are needed.
- **Mute mic**, **Camera off**, **Hang up**, and **Minimize/Expand** are in the call window. You can continue chatting while the call is minimized.
- Incoming calls ring inside the app for 20 seconds. Sound volume and mute are in Settings. Calls aren't recorded. Direct calls share network addresses with the other participant.
- One active call per person. The app has no fixed group-call participant limit. Unanswered invitations expire after 20 seconds and their tiles disappear. Members can join later using the matching phone or camera button while the call remains active. Crashed/disconnected clients time out. Calls have a two-hour limit. After a connection failure, hang up and call again.
- The backend uses authenticated polling (about 6 seconds idle, 1.5 seconds in a call), so incoming invitations can take a few seconds to appear.

## Validation and limits
Automated tests cover call authorization, state transitions, busy/blocked users, device binding, signaling visibility, relay gating, and retention. The local Electron test uses three real WebRTC peers with synthetic audio/video devices to exercise connection and controls. Real cameras, Windows hardware permissions, and cross-network TURN service must be checked after deployment. SQL and Edge Functions are supplied, not deployed to your project automatically.

## Screen sharing
Click the monitor button, then choose a screen or window from the thumbnail picker. Click it again to stop. Sharing sends the selected picture in place of your camera and keeps your microphone active. Stopping sharing restores your previous camera state. Screen audio is not included. On macOS, allow Screen Recording when requested, then restart if macOS asks.

Calls use a peer-to-peer mesh. Each participant sends media to every other participant, so computer and network capacity determine the practical group size. The existing two-hour session limit still applies.

Implementation uses Electron's display capture APIs with an explicit source picker. [Electron capture documentation](https://www.electronjs.org/docs/latest/api/desktop-capturer)
