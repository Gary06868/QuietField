# In-app updates (public Windows x64, 1.6.1+)

A release is shown as a message, never an automatic modal. Opening Messages marks the current release read in a separate local preference file. Reading survives restart; a higher version becomes unread again. After installation the old message disappears. Automatic checks run at most once per 24 hours, can be disabled, and never run in development or isolated QA profiles. Manual checks remain available. Personal builds do not initialize the update service or render Messages.

## Publishing a compatible update

1. Build and package the curated public source with the final numeric version in package.json. Keep the `QuietField-win32-x64` root directory in the ZIP.
2. Publish a stable GitHub Release (not a draft or prerelease) in `Gary06868/QuietField`, tagged `vX.Y.Z`.
3. Upload `QuietField-X.Y.Z-Windows-x64-public.zip`. Its metadata must expose an uploaded state, byte size and `sha256:` digest. Keep the checksum text attachment for manual downloads too.
4. Test the actual staged archive before marking it latest. Missing or incompatible asset metadata permits only the release-page fallback.

The app reads the official latest-release endpoint, allows only GitHub release download redirects, bounds archive size, verifies the SHA-256, and validates paths, runtime files, public edition and catalog audio before changing the application folder. It rechecks staged contents immediately before replacing files. Only after the helper is ready does the app quit. A version/ticket/PID-bound renderer-ready acknowledgment completes the update; a crash or missing acknowledgment restores the retained old folder. No admin rights are requested. Unwritable or unsuitable locations require moving the whole app or a manual download.

Keep the `quiet://app` origin, `quiet-field-settings` preference key, `quiet-field-audio` database and sound IDs stable across releases. Any future data migration must be non-destructive and covered by upgrade tests; never reset the profile to make an upgrade pass.

The user data directory remains `%APPDATA%/QuietField-Public`; updates do not move it. Download/staging and previous-version backups require additional disk space. Retained backups live next to the application as `.quiet-field-backup-VERSION-UUID`; once the new version is confirmed, the user may remove these old backups.

## Validation

- `npm test`: release selection, bounded downloads, hash mismatch, persisted read state and offline recovery.
- `node scripts/verify-updates.mjs [path-to-exe]`: real Electron message UI and restart persistence.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-update-worker.ps1 -IncludeTimeout`: adversarial ZIP cases, stage integrity, success, crash and timeout rollback. Uses isolated generated fixtures.
- `node scripts/verify-upgrade-e2e.mjs PATH-TO-PACKAGED-QuietField-win32-x64`: complete real packaged update using a local test-only 1.7.0 archive and replaced release transport; verifies restart, acknowledgment, retained backup, settings, imported audio and removal of the message. Never publishes the test archive.

This is a portable updater, not an installer or a code-signing system. Older published builds without an updater need a one-time manual upgrade. The current implementation targets Windows x64 only.
