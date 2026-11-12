# Cove Supabase Traffic Audit — Optimization Update

This document lists **code-level candidates** for unnecessary network traffic. It
does **not** establish which service caused the organization's egress or log
ingestion overage. Confirm the actual cause in the Supabase project dashboard
before making further trade-offs.

## Existing polling and the current PR

| Feature | When Cove queries Supabase | Optimization status |
| --- | --- | --- |
| Chat history | Latest 50 on first opening; 20 on cached recheck; 50 older when scrolling | In PR #7 |
| Missed chat messages | Reconcile recent 20 and retrieve additional missed rows in ascending cursor batches of 100 | In PR #7 |
| Room metadata | Realtime event-driven; safety refresh after ~120 s live / ~30 s disconnected while foregrounded | In PR #7 |
| Friend/block list | Realtime event-driven; safety refresh after ~180 s live / ~60 s disconnected while foregrounded | In PR #7 |
| Profile avatars | Known users cached; unknown or stale (10 minutes) fetched separately; live updates accepted | In PR #7 |
| Read receipts | 10 s while foregrounded; scroll requests throttled to 4 s except newly reaching bottom | In PR #7 |
| Active game cards | Fast 10 s reconciliation only while active; 45 s idle fallback and immediate finish transition | In PR #7 |
| Joinable calls | 8 s while foregrounded; refreshed on returning to foreground | In PR #7 |
| Presence heartbeat | 20 s while signed in (retains online status) | Deliberately unchanged |
| Friends' presence statuses | Heartbeat cadence while foregrounded, skipped while minimized | In PR #7 |
| Imposter game list | 2.5 s for joined players and 30 s after joining/creating (immediate follow-up refresh); 8 s for users not joined to a game | In PR #7; preserves prompt round auto-open for joining players |
| Live Imposter movement | During gameplay, revision-based state synchronization | **Unchanged:** never throttle without measured data and multiplayer testing |

## Required measurements before final release

1. In Supabase Usage, open the **Cove project specifically** and examine
   Egress and Log Ingestion by product/service and time. Determine whether
   PostgREST, Realtime, Storage, Auth, or errors dominate.
2. For an ordinary account, capture Supabase API request counts and response
   sizes during a five-minute signed-in idle session, five-minute active chat
   session, and a five-minute Imposter session.
3. Repeat those sessions with the PR #7 Windows build and compare **bytes
   transferred**, query counts, error rates, and observed message/game latency.
4. Look for repeated 4xx/5xx responses and other frequently emitted logs in
   the Supabase Logs Explorer; fix their underlying cause rather than deleting
   message history.
5. Test at least two Windows users: simultaneous messages, reactions, replies,
   edited/deleted messages, attachments, long chat scrolling, sleep/resume,
   offline/reconnect with more than 100 missed messages, room membership
   changes, unread status, online status, and active Imposter gameplay.

## Release guardrails

- The database retains full message history; this PR adds no message deletion.
- The cache is memory-only and cleared at sign-out.
- The SQL schema and existing RLS policies are unchanged.
- The original Keel 3D Imposter world, game actions, host lobby controls, and
  active movement sync remain unchanged.
- Passing Node tests and building an installer is necessary, **not sufficient**
  to claim quantified cost savings or complete Windows multiplayer QA.
