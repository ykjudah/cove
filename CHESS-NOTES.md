# TungChat Chess — implementation and setup

## Files

The complete game module is src/chess-game.cjs: rules integration, serializable
saves, original SVG pieces, board controls, animations, clocks, and review UI.
TungChat-Chess.js is its single-file browser bundle, including chess.js 1.4.0.
The existing app integration is in src/app.js. The SQL is in
supabase/upgrade-chess.sql, also included in the combined 1.6.0 upgrade.

The app loads styles from style.css to retain its existing Content Security Policy.
The standalone bundle can inject its exported STYLE when the host permits it;
pass injectStyles:false and load STYLE externally otherwise. No CSP weakening
was needed in TungChat.

## Invitations and transport

Use Games → choose a chess time control → Send chess. Controls are 1, 5, 10,
30 minutes per player, or unlimited. The invitation card displays that control.
Any other current chat member can accept; the first acceptance wins a database
row lock. A decline affects that member only, leaving a group invitation available
to others. The sender can cancel an unaccepted invitation.

Supabase chooses white and black once, inside the acceptance transaction, and
stores that assignment. White moves first. There is no local color coin flip.

chess_games.state is the full JSON save: players, FEN and square-to-piece map,
side to move, castling rights, en passant square, halfmove/fullmove counters,
move list, complete FEN position history, clocks, result, and outstanding draw offer.
Loading reconstructs and validates the move sequence with the same rules engine.

A move submission sends from, to, optional promotion, and the updated save.
The transport additionally supplies match ID, expected revision and request UUID
for authorization, concurrency and retry safety. Clients poll the saved game
once per second while the game is open. The opponent validates the same sequence
and animates a newly received move. Skipped revisions restore the full latest save.

## Clocks

The official clock uses Supabase server time, not either device's system clock.
Both players receive the chosen initial time. White's clock starts immediately
on acceptance, even if White has not opened the board. The active clock keeps
running when the app closes or disconnects. Use unlimited for asynchronous play.

Each accepted move deducts elapsed server time from the moving player's clock,
then switches the active clock. Offers and declines do not reset it. Time is
charged until the move reaches the server; there is no increment or lag refund.
Each response includes serverNow. The display estimates current server time using
half the measured round-trip delay and advances using performance.now().
Network jitter can cause small display corrections; the server decides the result.

No background browser timer or scheduled job is required to enforce expiry.
On the next read or action the database checks the stored deadline, records the
timeout, and refuses a late move. If everyone is offline, that result is persisted
when someone next opens the game, using the elapsed deadline rather than giving
the offline player extra time.

## Rules and assumptions

- You selected Chess.com-style automatic threefold and fifty-move draws, rather
  than strict FIDE claim procedures. Reference:
  https://support.chess.com/en/articles/8572743-how-do-draws-work
- Standard legal moves, castling, en passant, four promotion choices, check,
  checkmate, stalemate, and insufficient material use chess.js 1.4.0.
- Timeout follows the selected Chess.com-style material test. A bare king,
  king plus one bishop, or king plus one knight cannot win on time. Two knights
  can win on time. Bishop-only material confined to one square color cannot.
  Reference:
  https://support.chess.com/en/articles/8557986-my-opponent-ran-out-of-time-why-was-it-a-draw
- A draw offer can be explicitly accepted/declined; making a move declines an
  opponent's outstanding offer. Resignation has an inline confirmation.
- The original vector pieces are inspired by the Neo-style set shown in your
  supplied screenshots. No Chess.com image files, logo, or piece paths were copied.
- The slide duration (180 ms), shadow strength, and selection effects are original
  approximations of the requested feel, not verified Chess.com animation timings.
- Theme color comes from --accent through one --chess-accent variable. Dark squares
  mix that color with a dark neutral for contrast; light squares are off-white.
- Review navigation never changes the saved game. No analysis engine, evaluation
  scores, coaching, ratings, abandonment forfeits, or increment were requested.

## Security and limits

The database enforces room membership, participant identity, turn ownership,
random assignment, expected revisions, state-history continuity, clock deduction,
and timeout results. Clients cannot write the table directly or extend clocks.

As with existing pool, this is a casual friends game: full legal-move and board-end
validation runs in the shared client engine. The database checks structure and
continuity but does not independently execute that JavaScript engine. A deliberately
modified client is not protected by full server-side anti-cheat; a trusted rules
service would be required for that. Honest clients reject inconsistent histories.

Tests used local PostgreSQL/PGlite and Electron with a mock transport. Live
two-device Supabase networking and Windows installation were not exercised here.

## Checks completed

- Castling through an attacked square rejected; both legal castles available.
- En passant works, expires after one turn, and is rejected when it exposes check.
- Queen, rook, bishop and knight promotion; in-app four-piece picker.
- Checkmate, stalemate, threefold repetition, fifty-move draw, insufficient material.
- Timeout with king/bishop/knight insufficient material; two-knight timeout win.
- Save/reload and opponent replay; altered history rejected.
- Clock continuation offline, server clock overrides, duplicate request handling.
- Invitation declines, random persisted colors, outsider/spectator restrictions.
- Tap and drag movement, legal markers, last move, history review, theme extremes.
- Routine polling preserves selected pieces and an open promotion picker.
- Existing pool and messaging regression tests.
- All 25 automated tests and the Electron UI checks pass.

## Standalone host interface

Load TungChat-Chess.js to expose TungChess. Call TungChess.mount(root, {
state, player, profiles, serverNow, onMove, onAction, onClose }). profiles contains
{id,name,avatar}; player is the signed-in account ID.

onMove(move, proposedState, baseMoveCount) and onAction(action) return
{state, serverNow} after authenticated server storage. Feed remote responses to
view.receive(packet); call view.destroy() when closing. Actions are resign, offer,
accept_draw, decline_draw and refresh. The actual TungChat host already implements
these callbacks, plus invitation creation/acceptance, via the included SQL RPCs.

chess.js is BSD-2-Clause; the bundled attribution is in CHESS-LICENSE.txt.

## 1.6.1 appearance

Square labels use the opposite board-palette color without a background pill.
The selection overlay is blue with a 280 ms pulse on user selection; normal
polling does not restart the pulse. Reduced-motion users get a static overlay.
The shared CSS and single-file bundle contain the same styles.

## Premoves (1.6.3)

One local premove may be queued during the opponent's turn. The normal chess engine validates it against the received position before submitting through the existing authenticated, revision-checked move route. Illegal moves are cancelled. Promotion choice is explicit. Cancel via button, Escape or right-click. Closing the view or entering history review discards the premove. Premove moves use existing server clock accounting; there is no fixed Chess.com-style 0.1-second clock deduction. No move is sent early or persisted as a server-side premove.
