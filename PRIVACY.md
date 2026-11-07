# Cove privacy notice

Cove stores usernames, profile pictures, About me text, group details, friend/block relationships, messages, and reactions in the Supabase project selected by the app owner. Messages are not end-to-end encrypted; the Supabase project owner can read stored messages. Signed-in users can see profile details and group data permitted by their memberships.

## Moderation IP data

When the project owner deploys `record-session-ip` and configures `IP_MATCH_SECRET`, Cove asks the authenticated Supabase Edge Function to record the network address supplied in the platform-maintained `CF-Connecting-IP` header after sign-in. The function does not accept caller-controlled forwarding headers or an IP address in the request body. If the platform does not supply that header, no event is recorded.

The owner and admins appointed by the owner can see recent IP addresses under Settings → Moderation → IP information. Raw addresses are cleared after 7 days. Keyed fingerprints used to identify IP overlap are deleted after 90 days. Supabase Cron must be enabled for those time windows to be enforced while the app is idle; the migration schedules the cleanup job when Cron is enabled. The function and owner panel also run cleanup when they are used.

An IP overlap means accounts used the same visible network address during the retention window. Homes, schools, workplaces, mobile carriers, VPNs, and public networks can be shared. A match is a possible link for human review, not evidence that accounts belong to the same person. Cove does not use IP geolocation.

The moderation read functions check the owner or admin role on the server. Account deletion and admin management require the owner role. IP events have row-level security enabled and no direct client table grants. The Edge Function validates a Supabase user token and writes through Supabase's server-side privileged client. Keep `IP_MATCH_SECRET` private and do not add service keys to the desktop app or public source repository.

The designated owner can permanently delete a non-owner account from the moderation panel. Supabase removes its sign-in, profile, friend/block links, reactions, and IP records. Messages are retained for other chat participants with the sender shown as “Deleted account”; rooms created by that account remain. A server-side SQL function checks the signed-in caller against the private app-owner record and protects owner accounts. The function accepts no caller-supplied owner ID and does not expose service credentials.

The owner can disable IP collection by removing `record-session-ip` or its `IP_MATCH_SECRET`; existing records remain subject to the cleanup schedule. The owner can disable the cron job to stop scheduled processing, but then the stated 7-day and 90-day retention windows are no longer guaranteed.

## GIF removal and typing

GIF search and external GIF media loading have been removed. Previously saved KLIPY keys and random device IDs are cleared locally when this version opens. Existing GIF messages remain in history as text placeholders and do not contact the GIF provider.

Emoji shortcuts are converted locally into Unicode emoji. Typing indicators send temporary activity signals to other room members through Supabase Realtime; typed draft text is not broadcast.

## Online status and game wins (1.6.2)

The app sends an authenticated heartbeat approximately every 20 seconds with a random per-app-session ID. Other signed-in, unblocked users can see online/offline status; raw session IDs and timestamps are private. A session is online for 75 seconds after its last heartbeat. Signing out removes that device's session. Rows older than one day are deleted on subsequent heartbeats. Multiple devices count as one account's online status. No IP address is used for presence.

Finished pool and chess wins are retained in a private per-game ledger, counted once, and shown in player profiles and separate leaderboards to signed-in users, excluding blocked accounts. Win records persist after a game/chat is deleted; deleting the winning account removes its win records.

## Saved sign-in and media (1.6.3)

Supabase access/refresh tokens are saved in this app's local browser storage, scoped to the selected project; passwords are not saved. The app refreshes the session and restores the account on restart. Sign out clears the saved session. Profile pictures remain in the account's existing database record until changed or removed.

Uploaded chat images and custom emojis are resized locally and stored in a private Supabase Storage bucket. Metadata records the owner, chat (for images), name, kind and upload time. Custom emoji inventory is personal; sending an emoji grants eligible chat members access to its image. Access checks exclude blocked accounts. Signed URLs last ten minutes and can remain usable for that period after membership changes. Files count against the project's Storage allowance. Archived emoji files remain for message history. No automatic physical file cleanup is performed for deleted messages/accounts/rooms or abandoned uploads; the project owner may remove unused files from Storage.

## Owner messages (1.6.3)

The configured app owner can use /sudo to send plain text using another current chat member's sender identity. Such messages use ordinary chat styling without a public badge. A private audit table records the owner, target, chat, message ID and timestamp; normal clients cannot read or write it. The command requires an authenticated owner who belongs to the chat.

## Voice and video calls (1.6.9)
Calls are optional and start microphone/camera capture only after acceptance. No call audio or video is recorded or stored by Cove. WebRTC encrypts the media in transit. Direct peer connections disclose network addresses to the other participant; STUN/relay providers process connection metadata. If configured, Cloudflare TURN relays encrypted media when a direct connection fails. Its long-term key remains in Supabase secrets.

Private database signaling contains participant and room IDs, device session IDs, connection descriptions (which may include network addresses), and timestamps. Only the call participants on their participating devices can fetch it through authenticated functions. Descriptions are cleared when the call ends or expires; metadata is deleted after 24 hours by cleanup. Cleanup runs on call requests, and every minute if Supabase Cron was enabled when the migration ran. Without Cron, abandoned records remain until the next call request, so enable Cron for unattended retention enforcement. Calls expire after a lost heartbeat and have a two-hour maximum.

## Activity and shared networks
Authorized admins can review timestamps, account names and actions such as sign-in, messages, profile and group changes, reactions, media sharing, games and calls. The activity log stores event metadata for 30 days. Message text and call audio/video are excluded. Cleanup runs as events arrive, when admins view the log, and on a schedule when Supabase Cron is enabled. The school address 168.9.11.17 is excluded from alternate-account matching. Historical fingerprints are eligible only when connected to a known non-school address.

Custom emoji recipients can save and reuse a shared emoji in other chats. Group calls link up to eight participating devices using encrypted WebRTC connections. A direct connection shares network addresses among connected participants.
