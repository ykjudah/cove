# Cove releases

See [START-HERE.md](START-HERE.md) for the current procedure and [supabase/README.md](supabase/README.md) for database verification.

## Versions

- Public display: `release-config.json` (`1.3`).
- Internal updater/package version: `package.json` and `package-lock.json` (`2.8.0`). Keep internal versions increasing; do not reset them to match display branding.
- Release tag: `v` plus the full internal version (`v2.8.0`).
- Installer: `Cove-${version}-Setup-${arch}.exe`, using the internal version.

## Version bridge

The historical `v1.7.0` Git tag already points to source declaring package version `2.3.0`. As a result, version labels, installer filenames, and binary updater versions may disagree. `v2.3.1` exposed the runtime build number but was published with an internal version **lower than 2.7.0** reported by an actually installed Windows Cove client. The updater correctly rejects such a downgrade. The replacement **v2.8.0** must be built from source declaring internal version 2.8.0, signed with the existing key, and tested from the installed 2.7.0 client using **Check for updates**. A successful build or newly installed test client is not proof existing users can update. Do not re-tag or overwrite `v2.3.0`/`v2.3.1`. Confirm internal versions across other deployed computers before promising all machines will update.

## Build and release

Run `npm ci`, `npm test`, and `npm run dist`. The CI uses Windows and Node 22. Main/PR/setup-branch builds and manual runs upload test artifacts without publishing a release. The required Ed25519 key is the GitHub Actions repository secret `POCKETCHAT_UPDATE_SIGNING_KEY`. The signer verifies it against the pinned public key before writing signed metadata. An absent key is allowed only for non-tag test builds; tagged builds fail if the key is absent or mismatched.

After the reviewed code is on main and required production migrations are approved, applied, and verified, push a matching version tag. The workflow creates a draft release containing the installer, blockmap, and signed latest.yml from the same build. Inspect the generated notes and replace them with accurate user-facing patch notes. Verify an upgrade from the currently distributed Windows app, including preserved project/account settings, before publishing the draft. Never overwrite a previous release or tag to ship a new version.

The installer is a per-user NSIS installer, not a portable executable. It does not request administrator elevation. It is not Authenticode-signed; Windows may show an unknown-publisher warning. Signed update metadata protects update contents but does not remove that warning. Do not publish unsigned test metadata as an update.

## Database coordination

Client releases never apply SQL. Existing SQL files are historical manual upgrades, not a verified deployment ledger. Do not deploy them in filename order or assume they are all pending. Establish the live baseline first. Keep schema changes backward compatible with installed clients and document recovery before applying approved changes.
