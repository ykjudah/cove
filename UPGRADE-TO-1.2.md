PocketChat 1.2.0 — Profiles, friends, and a fresh look

DO THIS FIRST: UPDATE SUPABASE (only the app owner does this)
1. Open the SAME Supabase project your app already uses.
2. Open SQL Editor > New query.
3. Open PocketChat-upgrade-1.2.sql in Notepad, copy ALL its text into SQL Editor, and click Run.
This script supports the existing 1.1.0 or 1.1.1 database. It includes the expanded emoji upgrade. Accounts, messages, rooms, and reactions are preserved. No storage bucket setup is required.

PUBLISH THE UPDATE
1. Open https://github.com/ykjudah/pocketchat-updates/releases/new
2. Create a NEW tag: v1.2.0. Title: PocketChat 1.2.0.
3. Paste RELEASE-NOTES.txt into the description if you want.
4. In the Attach binaries area BELOW the description, upload the THREE individual files from release-files:
   PocketChat-1.2.0-Setup-x64.exe
   PocketChat-1.2.0-Setup-x64.exe.blockmap
   latest.yml
5. Wait until all files finish uploading. Publish a normal release, not a prerelease.
Do not edit latest.yml; it is already signed for your app. Keep the old releases available.

INSTALL THROUGH THE UPDATER
In your current PocketChat app: Settings > Updates > Check for updates.
Wait for the download, then select Restart to update. Settings should show v1.2.0.
Friends with updates configured can do the same. You can update directly from 1.1.0 or 1.1.1.
GitHub must be accessible on the network used for downloading updates.
Anyone still using the original 1.0 portable app needs to install the Setup EXE once.

NEW FEATURES
- Settings > Your profile: choose or remove your picture. JPG, PNG, or WebP, up to 5 MB.
  Pictures are center-cropped to 128 x 128 and stored as a small JPEG. Other signed-in people on your project can see them.
- Friends in the sidebar: send a request by username; view friends, incoming/outgoing requests, and blocked users.
- Incoming request: Accept or Decline. Outgoing request: Cancel.
- Click a name or avatar in a conversation or friends list to open a profile.
- Friend profiles: Message, Remove friend, or Block user.
- Blocking removes the friendship, cancels pending requests, and stops DMs in BOTH directions, including messages sent by older clients.
- Your app hides blocked users' message bodies, quoted text, and reaction chips. Shared groups remain shared: blocked users can still see messages you send to a shared group.
- New groups cannot contain two users who have blocked each other.
- Blocked tab: Unblock. This does not restore the old friendship; send a new request if wanted.
- Profiles, friends, and blocks sync between your devices. Accent and privacy preferences remain local.
- Rounded message bubbles, circular avatars, a redesigned sidebar, polished settings, and a simpler composer.
- Your chosen accent color is kept and now also colors your outgoing message bubbles.
- Existing hover reply/reaction controls, 114 emojis, and Shift-click deletion remain available.

CHECKS AND LIMITS
PostgreSQL permission tests and Electron UI tests passed with a mock chat backend.
Checks cover avatar ownership, friend-request lifecycle, blocking from old clients, new-group restrictions, profile image resize/removal, privacy hiding, and the 800 x 600 layout.
Update metadata uses the same signing key trusted by your installed app.
The installer is per-user and does not request administrator elevation. It is not the old portable build.
Windows installation, live Supabase Realtime, and the full hosted update-and-restart cycle still need checking on your Windows PC.
