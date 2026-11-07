# PocketChat 1.3.1 update

This update adds a profile/member panel beside chats, moves your profile photo and settings button in the navigation, and adds owner-only account deletion. Existing messages are kept with the deleted person's name anonymized.

## 1. Run the database update

In Supabase, open **SQL Editor → New query**, paste the contents of `supabase/upgrade-1.3.1.sql`, and run it once.

- This is for projects that already ran `upgrade-1.3.sql` for PocketChat 1.3.0.
- If your project is still on PocketChat 1.2, run `supabase/upgrade-1.3.sql` first, then `upgrade-1.3.1.sql`.
- For a new project, run `setup.sql`, `upgrade-1.1.sql`, `upgrade-to-1.2.sql`, `upgrade-1.3.sql`, then `upgrade-1.3.1.sql`.

No Storage bucket, new secret, or extra Edge Function is needed. The migration lets deleted accounts' messages and rooms remain without keeping their account identity. It also installs the owner-checked account-delete function in the database.

## 2. Publish PocketChat 1.3.1

Create a GitHub release tagged `v1.3.1`, titled **PocketChat 1.3.1**, and attach all three files inside `release-files`: the Setup EXE, its `.blockmap`, and `latest.yml`. Do not edit `latest.yml`. Existing users can then open **Settings → Updates → Check for updates** and restart when ready.

The app does not run SQL automatically. Complete step 1 before asking users to install the update. The group profile/member panel, footer photo/settings layout, and tagline cleanup need only the app update.
