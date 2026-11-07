# TungChat 1.6.1 — Chess polish and pool controls

- Chess rank numbers and file letters use the opposite square color, with no label background.
- Selected chess squares have a blue overlay and a short click pulse, without the old outline. Reduced-motion settings skip the pulse.
- Games and emoji icons are centered inside their button click targets.
- Owner magnets now have a 0–100% strength slider and affect only the owner's assigned balls.
- Magnets never pull the cue ball or the opponent's balls. Before groups are assigned, they affect nothing. The 8-ball is eligible only after the owner's group is cleared.
- An obvious 8-ball pocket-selection panel and pulsing pocket rings appear when needed. Aiming/power stay locked until a pocket is chosen; a miss allows a fresh choice next turn.
- Magnet strength travels with the shot for identical replay. Previously recorded shots retain their original replay behavior.

Upload the three release files, update both players, and run the included SQL.
The SQL validates the new strength field and preserves all existing games and chess setup.
