PocketChat 1.1.1 — publish your first update

1. UPDATE SUPABASE FIRST (only you do this)
Open your Supabase project, then SQL Editor > New query.
Open PocketChat-upgrade-1.1.1.sql in Notepad. Copy all its text into the query and click Run.
This adds support for the expanded emoji picker. It preserves your accounts, chats, and reactions.
It expects your previous 1.1 database upgrade to already be installed.

2. PUBLISH THE UPDATE
Open https://github.com/ykjudah/pocketchat-updates/releases/new
Create a NEW tag: v1.1.1
Release title: PocketChat 1.1.1
Paste RELEASE-NOTES.txt into the description if you want.
In the separate Attach binaries box UNDER the description, upload all THREE files inside release-files:
  PocketChat-1.1.1-Setup-x64.exe
  PocketChat-1.1.1-Setup-x64.exe.blockmap
  latest.yml
Wait until all three uploads finish. Publish as a normal release, not a prerelease.
Do not edit latest.yml: it has already been signed with your existing update key.
Do not upload this ZIP or the source ZIP in place of the three release files.

3. TRY IT IN YOUR CURRENT APP
Open PocketChat > Settings > Updates > Check for updates.
After the download finishes, choose Restart to update.
Check Settings shows v1.1.1.
Friends on 1.1.0 with the update source configured can update the same way.
Anyone still using the original portable 1.0 app must install the newer Windows app once.

HOW THE NEW CONTROLS WORK
Hover over a message to reveal the toolbar (keyboard users can Tab to it).
Click the reply arrow to reply.
Use the three quick reactions: thumbs up, heart, or laughing.
Click the smiling-face icon for 114 emojis, grouped by category and searchable by name.
Click a reaction again to remove your own reaction.
Only your own messages show a trash icon. Hold Shift while clicking it to delete immediately.
A normal click does not delete. Deleted text is erased for everyone; this cannot be undone.
Escape or clicking outside closes the emoji picker.

CHECKS
Automated PostgreSQL permission checks, all 114 reactions, and Electron UI checks passed.
The update metadata is signed with the existing PocketChat update key.
Full Windows installation and the live GitHub-to-Windows update cycle still need the test in step 3.
