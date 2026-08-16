# Changelog

All notable user-facing changes are recorded here. The project follows Semantic Versioning.

## Unreleased

### Added

- Added contributor setup/check guidance, a private security reporting policy, a code of conduct, structured issue forms, and a pull request checklist.

### Security

- Removed the repository-shared APK signing key. Debug clone builds now generate a private, per-user keystore on first use.
- Reject malformed Android package identifiers and unsafe clone labels before invoking Android tooling or a device shell.
- Bound imported track files to 10 MiB and 5,000 valid WGS84 points before deviation analysis.
- Added timeouts, rate limiting, response-size limits, status checks, and cancellation to location search.
- Added a restrictive browser Content Security Policy and final-boundary download filename sanitization.

### Changed

- Existing debug-clone installations can only be updated by builds signed with their original local key. Keep `debug-clone-tools/debug-clone.keystore` outside version control. If the key is lost, back up the clone data, uninstall the clone, and install a build signed with the replacement key.
