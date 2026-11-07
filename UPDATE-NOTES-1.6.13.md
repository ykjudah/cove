# Sahur Chat 1.6.13

- Moderation logs include the recipient for direct messages and the group name for group messages. New log records preserve those names at the time of the event.
- Hide Names masks message destinations in logs. Existing admin-only access and 30-day retention apply.
- Removed redundant chat-update log entries caused by message ordering updates.
- Clicking any call tile expands that person across the app window. Cameras, avatars and screen shares can be enlarged. Back to call returns to the grid, and leaving participants automatically clear the focused view.
- Call tiles fit their actual video proportions and the available space. The grid chooses a layout that maximizes visible media, and a single-person call gets a taller stage.

Run the included SQL and upload the three release files as v1.6.13. The record-session-ip deployment from 1.6.12 remains usable.

Older log destinations are reconstructed from currently available room membership and names. Deleted chats may show Chat unavailable. Message contents are excluded from these logs.

Validated with automated database/access tests and local Electron call windows using generated camera, microphone and screen-share streams. Physical device and cross-network testing remains a deployment check.
