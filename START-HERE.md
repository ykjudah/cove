# Cove development and release setup

Next release: **Cove 2.8.2 — Optimization Update**. Package/updater and display versions must both be 2.8.2; the Keel 3D Imposter and existing Supabase schema are unchanged. This update reduces redundant chat/profile/presence queries, adds message pagination and reconnect catch-up, and retains full chat history. Public distribution requires verified updater signing and all three release assets.

1. Work from the Git checkout connected to https://github.com/ykjudah/cove.
2. Use a task branch and pull request. Windows builds run for main, the initial setup branch, pull requests to main, and manual dispatches. Non-tag builds do not release anything.
3. Add the EXISTING private update key as the GitHub Actions repository secret `POCKETCHAT_UPDATE_SIGNING_KEY`. It must match `build/update-public-key.pem`. Never commit it or replace the public key as a shortcut.
4. Follow `supabase/README.md` to verify the live database before any SQL deployment. For the original 3D gameplay, check and apply **only** `supabase/upgrade-imposter-3d-compat.sql` after confirming the earlier ship-lobby migration is installed. Do not reapply historical upgrades.
5. Verify a Windows test build and the required backend changes before tagging. After a matching tag is pushed, CI tests, builds, verifies its update signature, and prepares a DRAFT GitHub release.
6. Test installation and upgrade from the currently distributed Windows app, confirm accounts/settings survive, and review patch notes and database readiness before publishing that draft.

Installer filenames use the internal version, for example `Cove-2.8.2-Setup-x64.exe`. The displayed version also matches 2.8.2. A build without the signing secret is for installation testing only and is not eligible for updater distribution.
