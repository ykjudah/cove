# TungChat 1.5.4

- Restored the dark game background while keeping the new table and ball palette.
- Slightly smaller pocket openings and smaller scoring hitboxes in new games.
- Removed the pale lip across the felt-facing pocket entrances.
- Owner-only Magnets toggle below the board. Enabled shots pull moving balls toward nearby pockets. The setting travels with the shot so replay stays consistent.
- Live opponent aiming, cue pull-back, power changes, cue-ball positioning, pocket selection, and shot animation through private game channels. Saved turns still reconcile through the database.
- Drag the cue ball to place it after a scratch/foul; four animated arrows show that it can be moved. Invalid positions are rejected; cancelling restores the previous placement.
- Much wider invisible cue-stick grab area without making the stick itself thicker.
- Pick a pocket before each 8-ball attempt. Misses allow a fresh choice on the next turn; sinking the 8-ball in the wrong pocket loses.
- Emoji-only messages display larger with no bubble. Mixed text and emoji keep their bubble.

Existing accepted games retain their earlier physics/rules. Send a new game to use the new rules after both clients update and the included SQL runs.

Validation: all 19 automated tests passed, including owner authorization, private channel access, called-pocket validation, smaller pockets, deterministic magnets/replays, old matches, emoji detection, and existing app permissions. Electron checks passed for the full messaging interface and new pool interactions, including live preview/replay between two local views. No live deployment performed.
