# Mini golf implementation and assumptions

## Confirmed with the user

Each player finishes the hole before the other plays (updated user preference). Include walls, angled walls, rotating blades, yellow direction pads and shaded arrow areas. Courses vary in size.

## Chosen rules

- New invitations offer 3 or 5 holes, using larger layouts (Dogleg, Yellow surprise, Pinball garden, plus Crosswind and The long way home for five). Legacy nine-hole saves retain their original course order. Maximum 10 strokes per player per hole. Reaching the cap completes that player's hole at 10, even if the ball never enters the cup.
- Both balls are visible but do not collide or block each other.
- The invitation accepter putts first on hole one, then the starting player alternates each hole. The player with fewer total strokes after the selected number of holes wins; equal totals draw and award no win.
- The cup is deliberately forgiving: ordinary full-power putts are captured. Very fast moving-blade boosts can pass/lip out and lose energy.
- A stopped ball remains where it rests. There are no water hazards, out-of-bounds penalties, jumps or height simulation.
- Holes advance automatically after both players finish. Only the final results show a scorecard.

## Reference interpretation

The supplied screenshots visibly show bright green courses, pale borders, muted grey-green surroundings, angled obstacles, rotating cross-shaped blades, yellow arrow pads, and shaded areas with white direction arrows. These visual categories are represented here. Their exact original friction, timing, dimensions, scoring and slope mechanics cannot be determined from screenshots. The shaded areas are implemented as directional slopes, as confirmed by the user. The nine layouts are original, not claims of exact GamePigeon course copies. Colors and proportions are visually matched to the supplied screenshots; app button/highlight colors use --accent via --golf-accent.

## Physics

World coordinates vary per hole. Ball radius is 6 world units. The simulation advances at 60 fixed ticks/second with at least four substeps, increasing subdivisions at higher speed so motion per substep stays below the ball radius. Static and angled walls use segment-distance collision with 0.78 normal restitution. Moving blades transfer surface velocity. Exponential rolling friction uses a 1.35/second coefficient; speed below 8 world units/second settles. Marked slopes apply 95 units/second² in the arrow direction while the active ball is in the patch.

Yellow pads trigger once per entry and launch at 500 world units/second. A saved 32-bit xorshift seed determines direction; there is no Math.random in simulation. Initial seed derives from the server-created match ID. The cup captures within 11 world units at speeds below 1700, including ordinary full-power putts (1300 maximum initial speed). Faster arrivals lose speed before a subsequent capture. A 20-second simulation cap prevents endless slope/blade loops without adding a penalty stroke. Positions and velocities are rounded to six decimal places each fixed tick.

Windmill phase derives only from saved obstacleTick, the course's fixed phase and angular speed. It advances during the shot and pauses between shots. This is an intentional synchronization choice: it avoids device-clock disagreements and restores exact obstacle positions, but is not a claim that GamePigeon pauses its windmills. The short dotted guide grows from 24 to 134 world units with power and stops before the first wall. It does not predict bounces or the full shot.

## State and messaging transport

src/mini-golf.cjs exports courses, initial/validate/start/step/simulate, aiming, drawing, thumbnail and mount. The bundled SahurChat-MiniGolf.js exposes SahurGolf in browsers. UI mount accepts state, player, profiles, onShot, onClose, onRematch, onDiscard and onPreview. It returns receive, receivePreview, getState, isBusy, setWins and destroy. The app uses its actual Supabase connection and authenticated accounts.

One JSON state stores version/courseSet, player IDs, active player, hole, both ball positions and sunk flags, two arrays of per-hole strokes, obstacleTick, PRNG seed, shotNumber, last completed hole, finished flag and winner. Courses are a versioned static definition; obstacle positions are fully derived from the stored tick. Saves contain no transient canvas objects.

Chat messages contain [[sahur-golf:v1]] plus match ID. create_golf_game and accept_golf_game manage invitations and atomic acceptance. submit_golf_shot receives match ID, expected revision, {angle,power} and the resulting state. It enforces identity, room membership, turn, fixed players, single-stroke progression, hole progression, score limits, result totals and idempotent retries. Clients cannot write match rows directly. Polling retrieves saved shot data and state every two seconds. The opponent replays from the previous state; after replay the displayed state is replaced by the saved authoritative end state, including any tiny numerical difference. Missing several shots snaps directly to the latest save.

As with the existing pool implementation, the server validates the result structure and progression but does not run a separate authoritative physics simulation. This is not a full anti-cheat server. A private ledger records at most one golf win per completed match; ties are excluded.

## Live viewing
Private actor-specific sahur-golf channels allow only that actor to broadcast, and only room members to receive. Aim/shot previews carry a base revision and are accepted only from the current actor. Shot heartbeats include simulation ticks for late viewers. Viewers simulate transient motion without saving or changing the authoritative state; the saved result reconciles without a second replay. Missing live events fall back to saved-shot replay.

## 1.6.6 shuffled matches
New matches use courseSet 3 and immutable courseOrder: a server-selected permutation of 3 or 5 distinct indices from 1–8. Randomness is used only once at acceptance, before play. The stored order is restored unchanged and has no influence on deterministic physics. Legacy courseSet 1/2 saves retain their course order.

## 1.6.8 courses and physics
The library has 19 designs; new 3-/5-hole games select from indices 1–18. Score arrays remain nine slots for saved-game compatibility. Ten new layouts are tested for tee/cup placement and full-width slopes. Randomizers resolve circular penetration at pad radius plus ball radius, then use the saved PRNG to select a launch within the outward hemisphere. The aiming guide clips at pads. Owner Hole in one mode simulates the chosen shot and checks for actual cup capture (not a stroke-cap completion) before allowing it; it never alters replay physics or server scores.

## 1.6.10
Ten additional courses occupy indices 19 through 28. The client and database share the same tee positions. Existing saved course indices retain their original layouts.

## 1.6.12 owner assist
With Hole in one enabled, a valid released shot glides directly from the ball to the cup over a fixed number of simulation steps, bypassing obstacles. It uses one stroke and preserves normal hole progression. Shot data carries an assist flag, checked against owner access by the backend. Both players must update for matching live replay. Ordinary shots retain the existing physics.
