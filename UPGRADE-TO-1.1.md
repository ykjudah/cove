# Upgrade PocketChat to 1.1

Your accounts, rooms, and old messages stay in your existing Supabase project.

## 1. Update the database once

1. Open the SAME Supabase project you already use.
2. Open SQL Editor → New query.
3. Open `supabase/upgrade-1.1.sql`, copy the entire script, paste it into SQL Editor, and click Run.
4. This adds replies, reactions, and author-only message deletion. It preserves your existing data and can safely be run again.

Do not rerun the old `setup.sql` on your existing project. New projects should run `setup.sql` first, followed by `upgrade-1.1.sql`.

## 2. Install the updated app

1. Close the old portable PocketChat window.
2. Run `PocketChat-1.1.0-Setup-x64.exe`. It installs for your Windows user and does not request administrator elevation.
3. Open PocketChat from its desktop or Start menu shortcut.
4. Use the same Supabase project URL, publishable key, username, and password. The project settings may carry over; enter them again if asked. You do not need a new account.
5. Give friends the same installer. Each person needs this one-time upgrade to get the new features and updater.

This version is an installed app, not the old portable EXE. It remains per-user, with no administrator rights required on an ordinary unrestricted Windows PC. The installer is unsigned; Windows may show an unknown-publisher warning. Managed PCs may still block it.

## New controls

- Settings → Appearance: use the color picker or a preset to change your accent color. This is saved on your computer.
- Settings → Privacy: hide the current conversation or all conversations. Names, avatar initials, group names, reply names, and reaction tooltips use aliases. The header's Hide names button is a quick shortcut. This affects your display only. It does not remove names typed inside message text.
- Reply next to a message: quote that message in your next message. Use × above the composer to cancel the reply.
- React next to a message: choose a reaction. Click an existing reaction to add or remove your own.
- Delete next to YOUR message: confirm to remove its text for everyone. A Message deleted marker remains to preserve replies. Deleted text is cleared from the database message row; it can still exist in backups, screenshots, or copies made earlier. Deletion cannot erase those copies.

## Automatic updates: connect hosting when ready

The updater is included, but no release repository is configured in this download. Until you set up hosting, the Settings panel says Update source not configured.

Use the separate **PocketChat Update Owner Kit** to configure your public GitHub release repository. The kit contains your private update-signing key: keep it to yourself and never send it to friends or commit it to GitHub.

Once hosting is ready, paste `https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY` into Settings → Updates → Update source and click Save source. Your friends can enter that same URL once. Later builds made by the supplied GitHub workflow have the repository preconfigured.

After configuration, the app checks on startup and every four hours, verifies the release signature, downloads valid updates, and displays Restart to update. You can also click Check for updates. Send or clear drafts before restarting. Updates are not silently installed while you chat.

Publishing a new EXE alone is insufficient: publish its signed `latest.yml` from the same build and the generated `.blockmap` too. The included workflow does this for tagged releases.

An app update does not automatically run Supabase database migrations. For future schema changes, run the provided migration before publishing a version that requires it, keeping it compatible with older clients during rollout.

## What was verified here

- Database tests: private-room access, sender identity, valid same-room replies, author-only deletion, erased message body, and reaction permissions/toggles.
- Desktop UI tests with sample data: login, centered plus, custom accent, alias privacy, replies, reaction add/remove, deletion, reply-preview deletion, and minimum-width layout.
- Updater tests: forged update metadata rejected before downloading, signed metadata accepted, and updater IPC commands restricted to the app window.
- Windows installer built and its execution-level manifest checked.

The Mac-based environment cannot test installing/running the Windows build or an actual Windows-to-Windows update. The new live Supabase features still need checking against your project after the migration. Keep the old download until you have verified the upgrade on your Windows computer.
