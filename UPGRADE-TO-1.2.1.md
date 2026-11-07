PocketChat 1.2.1

Changes
- New pocket-and-chat-bubble logo, replacing the pc lettering.
- Click your own message's trash icon normally to delete it. Shift is no longer required.
- Removed the typing hints beneath the message box and made the composer smaller.

Publish
1. If you already applied the 1.2.0 database update, no SQL changes are needed.
   If still on 1.1.0 or 1.1.1, run the included PocketChat-upgrade-1.2.sql in your existing Supabase project's SQL Editor first.
2. Open https://github.com/ykjudah/pocketchat-updates/releases/new
3. Create a NEW tag v1.2.1 and title PocketChat 1.2.1.
4. Attach all THREE individual files from release-files in the Attach binaries box:
   PocketChat-1.2.1-Setup-x64.exe
   PocketChat-1.2.1-Setup-x64.exe.blockmap
   latest.yml
5. Publish a normal release. Do not edit the signed latest.yml.
6. In PocketChat: Settings > Updates > Check for updates, then Restart to update.

Only your own messages have a trash icon. Deletion immediately erases the message text for everyone and cannot be undone.
Enter still sends a message; Shift+Enter still adds a new line.
The installer remains per-user and does not require administrator elevation.
UI checks passed with a mock backend. Windows installation and the hosted update/restart cycle still need testing on your Windows PC.
