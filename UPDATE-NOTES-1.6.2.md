# TungChat 1.6.2 — Games, wins, and online status

- Larger pool and chess views that adapt to the window.
- Better-positioned, centered close buttons for games.
- Separate pool and chess win totals in profiles and game headers.
- A wins leaderboard for each game, available from the game menu.
- Active games pinned above the message box so you can reopen them without searching through chat history.
- Online/offline indicators on people, with multi-device support.
- Centered emojis throughout the emoji menu and a symmetric, centered settings gear.
- Choose an 8-ball pocket by clicking it directly on the table; the extra selection panel is gone.
- Owner magnets are twice as strong at every slider percentage, while still affecting only eligible owned balls.
- Owner-only Visibility toggle predicts the full cue-ball and first-hit ball trajectories, including rebounds and stopping points, at the selected power.
- Previous shot replays keep their original physics. New stronger magnet shots carry their strength/version for matching replay on both devices.

Run the included SQL and upload the three files in release-files. No new keys, storage settings, or terminal commands.

Wins are recorded once by database triggers from saved finished games, with no direct client access to the win ledger. Existing stored completed games are backfilled. Rankings reflect the game's existing result validation, not a new server-side physics/chess anti-cheat engine. Owner-assisted pool wins count like other wins.

Online state uses short-lived authenticated session heartbeats, not IP matching. Closed sessions expire from online status after 75 seconds, plus polling delay; stale heartbeat rows are removed during later heartbeats after one day.
