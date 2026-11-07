# 8-ball implementation notes

The game is implemented in `src/eight-ball.cjs`. The existing application imports
it into its normal bundle. `src/app.js` supplies the chat integration; `index.html`
and `style.css` supply the controller button, dialogs, and matching app styling.
Packaged with TungChat 1.5.0. No remote deployment has been performed.

## Invitation and saved turns

The controller button opens Games → Send an 8-ball game. This inserts an open
invitation into the current chat. Any other current member can accept. A locked
SQL transaction gives the opponent slot to the first person to accept. The
accepting player breaks. Other members may watch but cannot shoot. Rematch posts another
open invitation into the same chat.

Run `supabase/upgrade-games.sql` in the SQL Editor after the existing app migrations
when ready to enable games. It adds `chat_games`, RLS, and three RPCs; no Edge
Function or Storage configuration is needed. This SQL has not been run remotely.

`chat_games.state` holds one JSON save containing version, players, turn, groups,
ballInHand, break, winner, shotNumber, all 16 balls, and a result label. Invitations
have a null state until accepted. Chat message bodies contain only
`[[tungchat-pool:v1]]<match UUID>`.

A shot submission contains angle in radians, normalized power 0.1–1, optional
cue position for ball-in-hand, and the complete end state, plus the match ID and
expected revision for routing/concurrency. The database checks membership,
participant identity, active turn, blocks, expected revision and data shape.
It rejects direct writes and makes identical retries idempotent. Matches are
fetched every 2.5 seconds while open; pending invitations every 2 seconds.
An opponent with the preceding revision replays the shot, then always adopts the
stored end state. Reopening a match loads the latest save; missed turns are not
all replayed. Closing a rolling/unsaved shot is blocked until it saves.

This is a casual friends game: the server validates turn authorization and save
structure but does not independently simulate physics. A modified client could
forge outcomes on its own turn. Competitive anti-cheat would require running
this same simulation on a trusted backend. No such protection is claimed here.

## Source physics and deliberate adaptations

The supplied 10 MB HTML is a TurboWarp package with an encoded Scratch project.
Its embedded project was decoded locally; the recovered project and readable
blocks are retained under `work/pool-source` for inspection. No game network
providers, music, external resources, or TurboWarp runtime are loaded by TungChat.

The port preserves the Ball physics sprite's 340×200 coordinate system, diameter
14, equal mass 200 collision equations, friction 0.02, stop threshold 0.1 on both
axes, two per-ball movement substeps, collision iteration order, sequential
overlap correction, rail bounds ±163/±93 and full velocity reflection. Pockets
use the six original coordinates, capture distance 13.5, and rail suppression
within 14. Rendering rotates the table into portrait. Maximum cue force is 14.

Deliberate changes needed for this request: a fixed 60 Hz timestep rather than
Scratch's scheduler; fixed numbered rack rather than randomized color groups;
rounding to 9 decimal places per tick; stable IDs instead of deleting shifting
list indices when multiple balls drop; and rejection of coincident centers
rather than division by zero. Drawing/aiming are new Canvas UI, not GamePigeon's
assets. The original rules are replaced with the requested rules.

Rules assumed where unspecified: on a legal break any colored pot keeps the
turn but does not assign groups; first legal colored pot after the break assigns
groups in simulation pocket order. The 8-ball on the break loses (early 8-ball).
A player must be on the 8-ball at the start of the shot to win; clearing the last
colored ball and 8 together does not win. No called-pocket, four-rail break,
post-contact rail foul, spin, or jump rules are added. A scratch while on the 8-ball loses, including when the 8-ball stays on the table.

The original attachment is complete enough to recover physics. It contains no
TungChat transport API or existing games collection, so the invitation/RPC
integration above is newly added to the actual messaging app.

## Verification

The complete automated suite passed (14 tests). Targeted pool tests additionally
cover null-turn payload rejection and losing on a scratch while on the 8-ball.
PostgreSQL checks ran locally with PGlite against the actual migrations, including
running the games migration twice. Electron checks exercised the actual app UI
with a mock backend, including sending an open invitation and acceptance.
A separate Electron check exercised the power meter, full shot animation, replay
and exact end-state reconciliation, plus portrait proportions and inactive input.
These are local tests, not a live two-device Supabase deployment test.

## 1.5.1 visual update

Ball orientations are visual-only rotation matrices advanced from per-tick travel.
They do not change physics, saved positions, or shot messages. Replays animate
rolling too; reopening resets decorative orientations. Lighting stays fixed.
The aim overlay now includes the cue's equal-mass tangential deflection.
Drag the rear of the cue along its axis to change power and release to shoot.
One group badge replaces each remaining-ball list. The composer has a searchable
emoji picker beside Games. All 15 automated tests and the Electron UI checks pass.

## 1.5.2 flow

Games is a send-only catalogue with thumbnails. Existing matches open from chat cards. Sending returns to chat; acceptance immediately gives the recipient the opening shot. Zero-power release cancels without submitting. Apply upgrade-1.5.2.sql to existing game deployments, or the complete upgrade-games.sql when upgrading from 1.4.0.

## 1.5.3 proportions and aiming

New saves use geometry version 2: 400×200 playing area, diameter 10.5,
rail limits ±194.75/±94.75, and corner pocket centers ±198/±98.
Side pocket centers and the original friction, collision equations, fixed tick,
capture thresholds and maximum force remain unchanged. Version 1 saves keep all
original geometry. The backend rejects changing a match's geometry version.
New rack coordinates are rounded to match PostgreSQL's canonical JSON exactly.

Rendering uses the same uniform scale for coordinates and ball radii.
Aiming uses a 38 ms exponential angular filter along the shortest arc.
Power dragging freezes the displayed direction; shot angles are normalized before
submission. Smoothing is visual input handling and never enters replay physics.
Palette colors are sampled/estimated from the supplied compressed screenshot;
these are original canvas drawings, not extracted GamePigeon assets.

Publish 1.5.3 and update both clients before running the SQL to enable new geometry.
Full upgrade-games.sql or incremental upgrade-1.5.3.sql may be run repeatedly.
All 16 automated checks pass, including both geometry versions and backend version
locking. Local Electron checks cover portrait layout and game controls.

## 1.5.4 controls, pockets and live previews

New games use version 3 with the same 400×200 geometry and 10.5 ball diameter.
Capture distance is 11 (previously 13.5); rail suppression distance is 11.5.
Earlier saves retain their original thresholds and rules.

Shot data optionally includes magnets (boolean) and calledPocket (integer 0–5).
For version 3, a player whose own group is cleared must call a pocket before each
shot. The simulation records each captured ball's pocket; a legal 8-ball win
requires the selected pocket. A miss does not retain a selection for future turns.
Wrong-pocket 8-ball potting loses. The database checks required call presence,
range and integer shape. As before, it does not independently simulate outcomes.

Magnets are disabled by default and only exposed to the owner. The submission RPC
rejects enabled magnets for non-owners. During an enabled shot, moving balls within
42 physics units of a pocket accelerate toward the nearest pocket with force
0.22 × (1 − distance/42) per fixed tick. Cue ball is included, so a magnet-assisted
shot can still scratch. Both clients use the same shot flag and deterministic math.
The flag is per shot, never inherited by the opponent. This remains a casual game,
not a server-simulated anti-cheat system.

Private Realtime topics use tungchat-pool:<game UUID>:<player UUID>. Membership
controls reads; only the named participant can send on their topic. The view
accepts only current-turn/current-revision previews, bounded values and increasing
sequence numbers. Moving input is sent at most 10 times per second, with a 1-second
idle heartbeat; previews expire after 2.5 seconds. They are transient and not saved
as chat messages or database rows. Previewed shots animate immediately; the view
waits for the saved end state before allowing the next turn. Missed live events
fall back to saved-shot replay via the existing 2.5-second poll. Reopening restores
the authoritative state. Closing the view removes both live subscriptions.

No new service or external keys are used. Apply the bundled full games SQL or
incremental supabase/upgrade-1.5.4.sql after updating both clients. SQL includes
the private Realtime policies. Local tests cover permissions, both local views,
placement cancellation, the wider cue hitbox, and called-pocket selection.
Live network latency/reconnect and two-device Supabase testing remain unverified.

## 1.6.1 adjustable own-ball magnets

New enabled magnet shots include magnetStrength in [0,1]. The RPC requires that
field for enabled magnets and retains the owner permission check. The fixed-tick
force is multiplied by that strength. Eligible balls are determined from the
shooter's group at the beginning of the shot: only that group, or the 8-ball
when no group balls remain. The cue and opponent's group are never eligible.
On an open table no balls are assigned, so magnets affect none.

Older recorded shots without magnetStrength retain the previous replay behavior;
new clients always send strength when enabled. Both players must update before
using this feature. Existing version 3 matches can use it; geometry versions 1/2
retain their earlier rules.

Before an eligible 8-ball shot, the UI blocks aiming and power input until a
pocket is selected. It shows pulsing pocket rings, a prominent prompt and six
named buttons. Backend validation still requires the pocket in the shot.

## Version 1.6.2

Pocket selection is now table-only: click a pulsing pocket before aiming at the 8-ball. There are no named pocket buttons. Owner magnets use magnetBoost:2 in new shots; missing boost retains historical replay behavior. The backend requires boost 2 for new enabled magnet shots. Visibility is an owner-only local simulation preview of cue and first-hit ball trajectories at current angle/power. It does not change the shot. Pool wins and active-game shortcuts require the included migration.
