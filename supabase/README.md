# Supabase deployment status

The saved project reference `quppwphdilsiducbrogj` opens the signed-in PocketChat project, labeled main / PRODUCTION in the dashboard. On 2026-11-07 the dashboard reports Healthy, no tracked migrations, no GitHub repository connected, and no backups. The Edge Functions list contains record-session-ip and update-account; call-ice is not listed. Read-only catalog checks found 14 public tables, all with RLS enabled, 19 public policies, and no supabase_migrations.schema_migrations table. The full schema, function source parity, secrets, and installed client configuration still need verification. Do not treat a healthy dashboard as proof of release readiness.

## Verify before changing anything

1. Install the official Supabase CLI and authenticate with `supabase login` locally. Never paste credentials into chat or commit tokens.
2. Run `supabase projects list` and confirm the project reference, owner, and environment against the installed app's project URL.
3. Link only after that confirmation: `supabase link --project-ref quppwphdilsiducbrogj`.
4. Inspect `supabase migration list --linked` and obtain a schema-only snapshot of the deployed public/private schemas, policies, functions, grants, triggers, and realtime configuration. Check storage policies and Edge Function deployments separately. Do not export message or account data into this repository.
5. Compare the snapshot with the legacy SQL and application requirements. Record which changes are actually present. Confirm backup/recovery coverage before proposing any writes.
6. Establish a reviewed baseline before introducing timestamped files under `supabase/migrations/`. Reconciling remote migration history is itself a database change and requires review; do not mark legacy files applied blindly.
7. Test new migrations against a disposable local or staging database. Inspect every pending migration with `supabase db push --linked --dry-run`, then obtain approval for the exact production changes before a real push.

The root-level setup.sql and upgrade-*.sql files remain intact as historical inputs used by tests. They are not copied into migrations automatically because overlapping upgrades and already-applied SQL can make that unsafe. No production SQL is run by GitHub Actions.

## Functions to verify

- record-session-ip: authentication, IP_MATCH_SECRET and retention/cron configuration.
- call-ice: authentication and the configured TURN relay credentials.
- update-account: authentication and server-only administrative credentials.

Client configuration accepts only public anon/publishable keys. Service-role credentials belong only on the backend. Verify live RLS and realtime behavior in addition to local PGlite tests.
