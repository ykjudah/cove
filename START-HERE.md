# Cove development and release setup

Cove now displays **2.8.1** and the internal updater version is **2.8.1**. This unreleased recovery integrates the original Three.js Imposter game from a checksum-pinned Cove 1.7.0 archive with the newer v2 multiplayer features. The next tag is **v2.8.1**, only after the final backend migration and multiplayer testing. Do not reuse existing tags.

1. Work from the Git checkout connected to https://github.com/ykjudah/cove.
2. Use a task branch and pull request. Windows builds run for main, the initial setup branch, pull requests to main, and manual dispatches. Non-tag builds do not release anything.
3. Add the EXISTING private update key as the GitHub Actions repository secret `POCKETCHAT_UPDATE_SIGNING_KEY`. It must match `build/update-public-key.pem`. Never commit it or replace the public key as a shortcut.
4. Follow `supabase/README.md` to verify the live database before any SQL deployment. For the original 3D gameplay, check and apply **only** `supabase/upgrade-imposter-3d-compat.sql` after confirming the earlier ship-lobby migration is installed. Do not reapply historical upgrades.
5. Verify a Windows test build and the required backend changes before tagging. After a matching tag is pushed, CI tests, builds, verifies its update signature, and prepares a DRAFT GitHub release.
6. Test installation and upgrade from the currently distributed Windows app, confirm accounts/settings survive, and review patch notes and database readiness before publishing that draft.

Installer filenames use the internal version, for example `Cove-2.8.1-Setup-x64.exe`. The displayed version also matches 2.8.1. A build without the signing secret is for installation testing only and is not eligible for updater distribution.
