# Cove 1.3 update notes

- Reworked movement to send ordered steps around corners. Late replies preserve newer input, and retried packets cannot move you twice.
- Faster nearby-player snapshots with interpolation and short motion prediction. Positions settle to the same authoritative coordinates. Internet latency still creates a small delay between devices.
- Rebuilt Keel corridors with right-angle bends and wider doorway joins. Client and server share the same floor geometry.
- Feathered lighting boundaries and more precise wall intersections.
- Raised Cafe tables and task consoles throughout the ship, with side faces, shadows, solid footprints, and depth ordering so characters can walk behind them.
- The map shows your current location with a labeled You marker.
- Public lobbies replace invitations. Anyone signed in can join an available lobby, respecting blocks and capacity.
- Choose from 12 suit colors and five hat choices in the lobby. Taken colors are unavailable.
- Victory/Defeat screens feature the winning crew in their chosen cosmetics.
- Corpses stay at the elimination location while ghosts move. Nearby living players can report them to start a meeting.
- Task and action buttons refresh when you enter their interaction range.

## Setup
Run the included SQL, then publish the three release-files on GitHub. No new storage bucket or Edge Function deployment is needed. Public version 1.3 uses updater version 2.3.0 to preserve upgrade ordering.

## Scope
Keel is the one map offered for new matches. The visuals use a layered 2D perspective, not a 3D engine. Real network latency cannot be eliminated. Automated checks cover server permissions, movement, reports, cosmetics, tasks, and the app UI. A live multi-computer school-network test is still recommended after installation.
