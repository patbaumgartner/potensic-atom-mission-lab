# Changelog

All notable user-facing changes are recorded here. The project follows Semantic Versioning.

## Unreleased

### Security

- Removed the repository-shared APK signing key. Debug clone builds now generate a private, per-user keystore on first use.
- Reject malformed Android package identifiers and unsafe clone labels before invoking Android tooling or a device shell.

### Changed

- Existing debug-clone installations can only be updated by builds signed with their original local key. Keep `debug-clone-tools/debug-clone.keystore` outside version control. If the key is lost, back up the clone data, uninstall the clone, and install a build signed with the replacement key.
