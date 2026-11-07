# Sahur Chat 1.6.9
- Added one-to-one video and voice calls from DM headers.
- Quiet incoming-call screen with Accept/Decline; no capture before acceptance.
- Microphone mute, camera toggle, local preview, remote video, hang up, and a compact call view while chatting.
- Busy protection, blocked-user enforcement, device-bound signaling, unanswered-call expiry, connection timeouts, and camera/microphone cleanup.
- Optional authenticated Cloudflare TURN relay with temporary credentials kept separate from the release files.
- Call signaling cleanup, privacy disclosure, and setup instructions in CALLS-SETUP.md.

Run the combined SQL and upload the three release-files assets as usual. Both participants need the update. Configure the optional relay for networks that cannot establish a direct call. No new Storage configuration.
