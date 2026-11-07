# TungChat 1.5.3 — Pool proportions and aiming

- Taller 2:1 playing surface, with narrower mahogany rails, cream pocket surrounds, muted teal felt, and a light gray background.
- Smaller glossy rolling balls, scaled consistently with their collision size.
- Table and ball palette matched to the supplied screenshot as closely as its resolution allows.
- Smoother aiming, including rotation across the angle boundary. Shot direction matches the displayed cue and guides.
- Updated pool thumbnails.
- Existing matches retain their original dimensions; newly accepted games use the new scale.
- Send-only game menu, recipient breaks, zero-power cancellation, emoji picker, and earlier messaging features are preserved.

Setup: publish the three release-files, update both players, then run the included SQL. No Storage or Edge Function changes.

Validation: 16 automated tests, including deterministic replay for both table versions, database access/turn checks, repeatable SQL upgrades, and smooth aiming math. Electron checks cover the app flows and pool controls, cancellation, shot replay, and portrait rendering. No live deployment performed.
