# Cove releases

See [START-HERE.md](START-HERE.md) for the current procedure and [supabase/README.md](supabase/README.md) for database verification.

## Versions

Next release: **v2.8.2 — Optimization Update**. It optimizes chat loading and Supabase traffic while retaining full chat history, existing backend permissions, and the verified Keel 3D Imposter game. No database migration is required for this update.

- Public display: `release-config.json` (`2.8.2`).
- Internal updater/package version: `package.json` and `package-lock.json` (`2.8.2`). Keep internal versions increasing; do not reset them to match display branding.
- Release tag: `v` plus the full internal version (`v2.8.2`).
- Installer: `Cove-${version}-Setup-${arch}.exe`, using the internal version.

## Version bridge

The historical `v1.7.0` Git tag already points to source declaring package version `2.3.0`. As a result, version labels, installer filenames, and binary updater versions may disagree. `v2.3.1` exposed the runtime build number but was published with an internal version **lower than 2.7.0** reported by an actually installed Windows Cove client. The updater correctly rejects such a downgrade. The recovery **v2.8.1** must be built from source declaring internal version 2.8.1, signed with the existing key, and tested from the installed 2.7.0 client using **Check for updates**. A successful build or newly installed test client is not proof existing users can update. Do not re-tag or overwrite `v2.3.0`/`v2.3.1`. Confirm internal versions across other deployed computers before promising all machines will update.

## Authentic 3D Imposter recovery

The original Cove 1.7.0 Windows installation actually contains internal version 2.7.0 and a Three.js-based 3D Imposter game. The current source import omitted it. For v2.8.1, the Windows workflow retrieves the original installer, extracts its app.asar, verifies the pinned SHA-256, and runs `scripts/restore-imposter-3d.cjs` to generate the original 3D game, matching CSS and bundled license notices. Never ship the 2D fallback as if it were the original game. Local builds require first running `npm run restore:imposter3d -- /path/to/original/app.asar`.

Apply `supabase/upgrade-imposter-3d-compat.sql` only after checking the live database baseline and the previous ship-lobby migration. It creates separate 3D movement/action RPCs, preserves v2 RPCs for older clients, and adds server-side vents/repair support. Tests for the migration are in `test/imposter-3d-backend.test.cjs`. Do not publish a release until Windows multiplayer gameplay has been manually verified with real accounts, including full 3D rendering, cosmetics, tasks, vents, repair, votes, kicks, return to lobby, and auto-update from 2.8.0. New versions must always be greater than prior internal versions.

## Build and release

Run `npm ci`, `npm test`, and `npm run dist`. The CI uses Windows and Node 22. Main/PR/setup-branch builds and manual runs upload test artifacts without publishing a release. The required Ed25519 key is the GitHub Actions repository secret `POCKETCHAT_UPDATE_SIGNING_KEY`. The signer verifies it against the pinned public key before writing signed metadata. An absent key is allowed only for non-tag test builds; tagged builds fail if the key is absent or mismatched.

After the reviewed code is on main and required production migrations are approved, applied, and verified, push a matching version tag. The workflow creates a draft release containing the installer, blockmap, and signed latest.yml from the same build. Inspect the generated notes and replace them with accurate user-facing patch notes. Verify an upgrade from the currently distributed Windows app, including preserved project/account settings, before publishing the draft. Never overwrite a previous release or tag to ship a new version.

The installer is a per-user NSIS installer, not a portable executable. It does not request administrator elevation. It is not Authenticode-signed; Windows may show an unknown-publisher warning. Signed update metadata protects update contents but does not remove that warning. Do not publish unsigned test metadata as an update.

## Database coordination

Client releases never apply SQL. Existing SQL files are historical manual upgrades, not a verified deployment ledger. Do not deploy them in filename order or assume they are all pending. Establish the live baseline first. Keep schema changes backward compatible with installed clients and document recovery before applying approved changes.
