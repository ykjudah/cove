# Sahur Chat 1.6.3 — Premoves and sharing

- Chess premoves: queue one move during your opponent's turn. It plays when your turn arrives if legal; illegal premoves are cancelled. Includes tap/drag, promotion choice, highlights, and cancellation controls.
- Only the two most recently updated active games are pinned at the bottom of chat.
- Stay signed in across restarts and updates, until you sign out or your session is invalidated.
- Account profile pictures are loaded automatically, with restart persistence verified.
- Send JPG, PNG, and WebP images with a preview before sending.
- Upload a personal custom emoji collection, saved to your account and available from the emoji menu. Custom emojis send as standalone images; removing one from your inventory preserves past messages.
- Images are resized and stored in a private Supabase bucket with chat membership and ownership access controls.

Run the included SQL, then upload the three release files. The SQL configures the Storage bucket and policies; no separate dashboard setup or API key is needed. Images use the project's storage allowance. See START-HERE for file limits and retention details.

- Renamed to Sahur Chat with a new silhouette logo and app icon.
- Leaderboards moved into a separate panel beside the game menu.
- Owner-only `/sudo username message`, using ordinary sender styling with a private server audit.
- Hide names now applies across the whole app, including the quick toggle.
- Fullscreen on launch; F11 toggles it and Escape exits fullscreen.
- Direct messages have an × for immediate closing with no confirmation; history remains saved.
