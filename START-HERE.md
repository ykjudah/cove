# Cove development and release setup

Cove displays **1.3**. Its internal package/updater version is **2.3.2**; package.json and package-lock.json must agree. The next tag for this source is **v2.3.2**, after verifying updater compatibility with installed v1.7.0/v2.3.0 clients. Do not use cove-v1.3.0 or move an existing tag.

1. Work from the Git checkout connected to https://github.com/ykjudah/cove.
2. Use a task branch and pull request. Windows builds run for main, the initial setup branch, pull requests to main, and manual dispatches. Non-tag builds do not release anything.
3. Add the EXISTING private update key as the GitHub Actions repository secret `POCKETCHAT_UPDATE_SIGNING_KEY`. It must match `build/update-public-key.pem`. Never commit it or replace the public key as a shortcut.
4. Follow `supabase/README.md` to verify the live database before any SQL deployment. Legacy SQL files are not proof of applied migrations.
5. Verify a Windows test build and the required backend changes before tagging. After a matching tag is pushed, CI tests, builds, verifies its update signature, and prepares a DRAFT GitHub release.
6. Test installation and upgrade from the currently distributed Windows app, confirm accounts/settings survive, and review patch notes and database readiness before publishing that draft.

Installer filenames use the internal version, for example `Cove-2.3.2-Setup-x64.exe`. The app still displays Cove 1.3. A build without the signing secret is for installation testing only and is not eligible for updater distribution.
