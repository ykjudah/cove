# Cove releases

See [START-HERE.md](START-HERE.md) for the current procedure and [supabase/README.md](supabase/README.md) for database verification.

## Versions

- Public display: `release-config.json` (`1.3`).
- Internal updater/package version: `package.json` and `package-lock.json` (`2.3.0`). Keep internal versions increasing; do not reset them to match display branding.
- Release tag: `v` plus the full internal version (`v2.3.0`).
- Installer: `Cove-${version}-Setup-${arch}.exe`, using the internal version.

## Build and release

Run `npm ci`, `npm test`, and `npm run dist`. The CI uses Windows and Node 22. Main/PR/setup-branch builds and manual runs upload test artifacts without publishing a release. The required Ed25519 key is the GitHub Actions repository secret `POCKETCHAT_UPDATE_SIGNING_KEY`. The signer verifies it against the pinned public key before writing signed metadata. An absent key is allowed only for non-tag test builds; tagged builds fail if the key is absent or mismatched.

After the reviewed code is on main and required production migrations are approved, applied, and verified, push a matching version tag. The workflow creates a draft release containing the installer, blockmap, and signed latest.yml from the same build. Inspect the generated notes and replace them with accurate user-facing patch notes. Verify an upgrade from the currently distributed Windows app, including preserved project/account settings, before publishing the draft. Never overwrite a previous release or tag to ship a new version.

The installer is a per-user NSIS installer, not a portable executable. It does not request administrator elevation. It is not Authenticode-signed; Windows may show an unknown-publisher warning. Signed update metadata protects update contents but does not remove that warning. Do not publish unsigned test metadata as an update.

## Database coordination

Client releases never apply SQL. Existing SQL files are historical manual upgrades, not a verified deployment ledger. Do not deploy them in filename order or assume they are all pending. Establish the live baseline first. Keep schema changes backward compatible with installed clients and document recovery before applying approved changes.
