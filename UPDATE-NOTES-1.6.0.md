# TungChat 1.6.0 — Chess

- Added chess beside 8-ball in the send-only game menu, with a board thumbnail.
- Choose 1, 5, 10 or 30 minutes per player, or unlimited.
- Accept/decline invitations, server-assigned colors, and saved games in chat.
- Original Neo-inspired SVG pieces, theme-colored board and accents, dark interface.
- Tap or drag pieces; legal-move dots, capture rings, last-move highlights and check glow.
- Sliding moves, captured pieces/material difference, active clocks above/below board.
- Scrollable move list and safe earlier-position review.
- Castling, en passant, four-choice promotion, checkmate and standard automatic draws.
- Resignation confirmation, draw offers, and timeout versus insufficient-material handling.
- Server-controlled clocks continue while offline; device clock changes cannot add time.
- Existing pool, owner magnets, emoji messages and messaging features preserved.

Setup remains three GitHub release files and one Supabase SQL script.
Timed games begin counting at acceptance. Use unlimited for asynchronous play.

Checked: all 25 automated tests and Electron app/pool/chess interaction checks.
Full legal-move validation runs on both clients; this is a friends game rather
than a fully server-simulated anti-cheat service. See CHESS-NOTES.md for assumptions,
clock details, references, and test coverage.
