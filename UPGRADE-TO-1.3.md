# PocketChat 1.3.0 setup

This update adds group leave/name/picture controls, per-user DM hiding, editable profile text, and the optional owner moderation panel. It preserves accounts, chat history, and reactions.

## 1. Update the Supabase database

- For an existing PocketChat 1.2 project, run `supabase/upgrade-1.3.sql` once in the Supabase SQL Editor.
- For a new project, run `supabase/setup.sql`, `supabase/upgrade-1.1.sql`, `supabase/upgrade-to-1.2.sql`, then `supabase/upgrade-1.3.sql` in that order.

The migration adds no Storage bucket. Profile and group pictures are resized in the app and stored as small JPEG data in protected database columns.

## 2. Set the one app owner

Create the owner's PocketChat account, then run this in the SQL Editor, replacing `your_username` with that exact PocketChat username:

```sql
insert into private.app_owner(singleton, user_id)
select true, id from public.profiles where username = lower('your_username')
on conflict (singleton) do update
set user_id = excluded.user_id, set_at = now();
```

This sets the single owner allowed to see the moderation panel. The owner table is in the private schema and has no client read or write grants. Only use the SQL Editor as the project owner to change it.

## 3. Turn on automatic IP-data cleanup

Enable Supabase Cron in the project Dashboard, then run `supabase/upgrade-1.3.sql` again. If Cron was already enabled before the migration, the migration scheduled `pocketchat-ip-retention` automatically. Confirm it appears in the Dashboard's Cron jobs.

The daily job clears raw IP addresses after 7 days and deletes match fingerprints after 90 days. The Edge Function and owner panel also run cleanup when used, but Cron is needed to enforce those windows while the app is idle.

## 4. Deploy authenticated IP logging

Install the Supabase CLI, link this project, and deploy the provided function from the project root:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy record-session-ip
```

Set `IP_MATCH_SECRET` in Dashboard → Edge Functions → Secrets. Use at least 32 random bytes (for example, generate a 64-character random hexadecimal value). Keep it out of the source tree and never put it in the desktop app. The function uses Supabase's platform-provided privileged client internally; no service key is included in the project files.

The app calls this function after a successful sign-in. The function verifies the signed-in user and reads only the platform-maintained `CF-Connecting-IP` header; it does not fall back to caller-controlled forwarding headers or accept an IP supplied by the app. If the platform does not provide that header, no event is stored. A keyed HMAC fingerprint supports overlap matching without retaining the IP as the long-term match key.

## 5. Publish the desktop build

Build from the updated source using the steps in `RELEASES.md`. Users should upgrade to 1.3.0 after the database migration and function deployment are complete. The desktop client reports a database migration is needed if it starts before the 1.3 schema is installed.

The sign-up screen displays the moderation IP notice and requires new accounts to acknowledge it. The notice explains the retention period and that same-IP matches are only possible links, not proof of alternate accounts. Read `PRIVACY.md` before enabling the moderation feature.
