# Sahur Chat 1.6.12

- Added original Discord-inspired sounds for incoming/outgoing calls, messages, sent messages, joining/leaving, microphone, camera and screen sharing. Settings includes volume, preview and mute.
- Conversations with new messages move to the top. Ordering survives restarting the app.
- Added screen/window sharing to voice and video calls with a thumbnail picker and camera restoration when sharing ends.
- Expanded calls hide the duplicate conversation header. Call icons are centered.
- Removed the fixed eight-person call cap. All eligible chat members receive a 20-second invitation. Unanswered tiles disappear, with later joining available while the call stays active.
- Rebuilt Appearance with six presets, dark/light modes, a saturation/brightness picker, hue, hex input, up to three colors, intensity, live preview, Reset and Apply.
- Excluded 168.9.116.17 from moderation matching and logging, alongside 168.9.11.17. Removed stored records for known excluded fingerprints.
- Changed the owner Hole in one assist to animate a direct shot into the cup. Backend owner authorization and deterministic replay are included.

## Setup
Run the included SQL, deploy the updated record-session-ip function from the source ZIP, then upload the three release files to GitHub release v1.6.12. START-HERE.md contains the steps.

## Implementation choices and validation
- Sounds are original synthesized cues with local controls.
- Screen sharing replaces the camera image while preserving microphone audio. Shared computer audio is excluded.
- Calls use the existing peer-to-peer mesh. Available bandwidth and device performance determine practical participant capacity.
- Owner golf assist deliberately bypasses obstacles and uses one stroke.
- Automated tests cover migrations, authorization, invitation expiry, later joining, more than eight participants, school-IP cleanup, theme data, room ordering and deterministic assist shots.
- Local Electron tests cover the settings/chat UI and three call windows with synthetic microphones, cameras and a shared canvas. Physical Windows screen capture and calls across different networks still need deployment testing.
