# PocketChat 1.4.0 update

## 1. Run the database update

In Supabase, open **SQL Editor → New query**, paste all of `supabase/upgrade-1.4.0.sql`, then click **Run** once.

- This is for projects already updated to PocketChat 1.3.1.
- If the project is on 1.3.0, run `upgrade-1.3.1.sql` first, then `upgrade-1.4.0.sql`.
- If it is on 1.2, run `upgrade-1.3.sql`, `upgrade-1.3.1.sql`, then `upgrade-1.4.0.sql`, in that order.
- For a new Supabase project, run `setup.sql`, `upgrade-1.1.sql`, `upgrade-to-1.2.sql`, `upgrade-1.3.sql`, `upgrade-1.3.1.sql`, and `upgrade-1.4.0.sql`, in that order.

This migration adds read/send policies for private typing broadcasts. Access is limited to members of the group named in the channel. Supabase Realtime must be enabled for the project. No Storage bucket, new secret, or additional Edge Function is needed for this update. See [Supabase's Realtime authorization guide](https://supabase.com/docs/guides/realtime/authorization).

## 2. Publish the update files

On the PocketChat updates GitHub repository, create a release tagged `v1.4.0` and attach the three files in `release-files`: `PocketChat-1.4.0-Setup-x64.exe`, its `.blockmap`, and `latest.yml`. Keep `latest.yml` unchanged. Existing users can then open **Settings → Updates → Check for updates** and restart when prompted. New users can run the Setup EXE.

## 3. Turn on KLIPY GIF search

Create or copy your KLIPY app key using [KLIPY's API guide](https://docs.klipy.com/). Open PocketChat **Settings → GIF search**, paste the key, and save it. Each friend enters that same app key on their own computer. The key is stored locally and requests go from the app directly to KLIPY. Test keys are limited to 100 API requests per hour; request production access before wider use.

No new Supabase Storage configuration is required: chat messages store the KLIPY media link and the GIF is loaded from KLIPY. Search terms and a random ID for the computer are sent to KLIPY for API search/share tracking; PocketChat account IDs and chat history are not sent.

## 4. What changed in the app

- New-message notifications appear only inside PocketChat and are silent. You can turn them off in **Settings → Notifications**.
- Typing indicators are temporary private broadcasts and do not create chat-history messages.
- The right-side profile/member viewer is removed. Open a profile from the chat header when available; edit your own profile by clicking your name or picture.
- GIF search and sharing are in the **GIF** button below the message box.
