# Cove releases

See [START-HERE.md](START-HERE.md) for the current procedure and [supabase/README.md](supabase/README.md) for database verification.

## Versions

- Public display: `release-config.json` (`1.3`).
- Internal updater/package version: `package.json` and `package-lock.json` (`2.3.2`). Keep internal versions increasing; do not reset them to match display branding.
- Release tag: `v` plus the full internal version (`v2.3.2`).
- Installer: `Cove-${version}-Setup-${arch}.exe`, using the internal version.

## Version bridge

The historical `v1.7.0` Git tag already points to source declaring package version `2.3.0`. As a result, version labels, installer filenames, and binary updater versions may disagree. `v2.3.2` advances the internal version and exposes the runtime build number in Settings. Test **automatic update discovery from an existing v1.7.0 installation** before publishing; a green current-version build alone is not proof that older clients will upgrade. Never re-tag or overwrite `v2.3.0`.

## Updater recovery for previously installed clients

The previously distributed updater accidentally checked `result.isUpdateAvailable`, but `electron-updater` signals availability through the `update-available` event. The 2.3.2 fix listens to that event and downloads verified releases. **Existing clients with the broken updater cannot self-apply the fix.** Arrange a one-time managed or user-triggered install of 2.3.2; future versions should then be discovered correctly. Do not claim remote repair is possible without a deployment mechanism. Confirm from an installed 2.3.2 client that it sees a later release in staging or controlled testing before promising automatic upgrades.

## Build and release

Run `npm ci`, `npm test`, and `npm run dist`. The CI uses Windows and Node 22. Main/PR/setup-branch builds and manual runs upload test artifacts without publishing a release. The required Ed25519 key is the GitHub Actions repository secret `POCKETCHAT_UPDATE_SIGNING_KEY`. The signer verifies it against the pinned public key before writing signed metadata. An absent key is allowed only for non-tag test builds; tagged builds fail if the key is absent or mismatched.

After the reviewed code is on main and required production migrations are approved, applied, and verified, push a matching version tag. The workflow creates a draft release containing the installer, blockmap, and signed latest.yml from the same build. Inspect the generated notes and replace them with accurate user-facing patch notes. Verify an upgrade from the currently distributed Windows app, including preserved project/account settings, before publishing the draft. Never overwrite a previous release or tag to ship a new version.

The installer is a per-user NSIS installer, not a portable executable. It does not request administrator elevation. It is not Authenticode-signed; Windows may show an unknown-publisher warning. Signed update metadata protects update contents but does not remove that warning. Do not publish unsigned test metadata as an update.

## Database coordination

Client releases never apply SQL. Existing SQL files are historical manual upgrades, not a verified deployment ledger. Do not deploy them in filename order or assume they are all pending. Establish the live baseline first. Keep schema changes backward compatible with installed clients and document recovery before applying approved changes.
