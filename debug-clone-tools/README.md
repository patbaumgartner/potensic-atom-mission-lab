# Debug Clone Tools

Device-side tooling for researching the **PotensicPro** Android app on your **own**
phone: build a debuggable side-by-side clone, strip its telemetry, pull logs and
sandbox data, and push a generated `map.db` onto the device.

The web planner in the repo root ([../README.md](../README.md)) only *downloads* a
`map.db` — these scripts are what actually get it onto the phone and let you test
the upload/backup mechanics safely.

> **Scope & safety.** For local research on hardware you own. Do not redistribute
> patched APKs. Nothing here bypasses flight limits, geofencing, or app safety
> behavior. Every write to the device is backup-first and targets the debuggable
> **clone** package, never the Play Store install.

## Contents

| File | Purpose |
|------|---------|
| `make-potensicpro-debuggable.sh` | Pull, patch (`debuggable="true"`), rebuild and sign the APK — original or a side-by-side clone. |
| `patch-clone-privacy.sh` | The "My Atom" privacy patch: rename, strip Bugly + Mapbox trackers, disable self-update and beginner guide, add an in-app `map.db` importer. |
| `pull-potensicpro-logs.sh` | Read-only pull of logs, metadata, shared storage, and sandbox (`run-as`). |
| `push-mapdb-to-clone.sh` | Backup-first upload of a generated `map.db` into the clone sandbox. |
| `debug-clone.keystore` | Local signing key for the rebuilt/clone APKs. |

## Prerequisites

The scripts target **WSL/Linux using Windows-installed Android tools** by default:

```bash
ADB=/mnt/c/ProgramData/chocolatey/bin/adb.exe
ANDROID_SDK=/mnt/c/Android/android-sdk
BUILD_TOOLS=/mnt/c/Android/android-sdk/build-tools/36.0.0
```

Packages:

```text
Original app: com.ipotensic.potensicpro
Debug clone:  com.ipotensic.potensicpro.debug
```

Enable **Wireless debugging** on the phone. Ports rotate — if `adb devices -l`
already shows one connected device the scripts use it automatically; otherwise
pass `--device HOST:PORT` (or `--connect HOST:PORT` where supported).

Run every script from the repository root.

## 1. Build the side-by-side clone

Create a debuggable package that installs next to the Play Store app, de-tracked
via the privacy patch, labeled **My Atom**:

```bash
debug-clone-tools/make-potensicpro-debuggable.sh --clone-package debug --privacy
```

- `--clone-package debug` → `com.ipotensic.potensicpro.debug`
- `--privacy` applies `patch-clone-privacy.sh` (rename, strip Bugly + Mapbox
  telemetry, disable self-update and the beginner guide, add an in-app `map.db`
  importer button)
- Override the launcher label with `--clone-label "My Atom"`
- Add `--device HOST:PORT` for an explicit wireless endpoint

Output lands under `debuggable-apk/potensicpro-debuggable-YYYYMMDD-HHMMSS/`.

Install and verify `run-as`:

```bash
/mnt/c/ProgramData/chocolatey/bin/adb.exe install -r \
  debuggable-apk/.../signed/potensicpro-debug-clone.apk

/mnt/c/ProgramData/chocolatey/bin/adb.exe shell \
  run-as com.ipotensic.potensicpro.debug pwd
# -> /data/user/0/com.ipotensic.potensicpro.debug
```

The clone has its **own sandbox**, so it is safe for testing upload/pull
mechanics — but it cannot read the original app's private data:

```text
Original data: /data/data/com.ipotensic.potensicpro/...
Clone data:    /data/data/com.ipotensic.potensicpro.debug/...
```

### Patching an existing decoded clone

To re-apply just the privacy patch to an already-decoded apktool tree:

```bash
debug-clone-tools/patch-clone-privacy.sh \
  --decoded-dir debuggable-apk/.../work/base-clone-decoded
```

With no `--decoded-dir` it uses the latest `debuggable-apk/*/work/base-clone-decoded`.

### Debuggable original build (advanced)

`make-potensicpro-debuggable.sh` with no `--clone-package` patches the original
package instead. A locally signed APK usually cannot update the Play Store
install (different signing certificate); installing may require uninstalling the
original app, which **deletes its private `map.db`**. Treat this as a separate,
destructive decision.

## 2. Push a generated `map.db` to the clone

[push-mapdb-to-clone.sh](push-mapdb-to-clone.sh) writes a `map.db` into the clone
sandbox, backup-first: it backs up the current on-device database, force-stops the
app, writes the new file binary-safely via Base64, and verifies size + SHA256. It
refuses to target the non-debuggable Play Store package.

```bash
# Explicit file:
debug-clone-tools/push-mapdb-to-clone.sh --map ~/Downloads/map.db --device 192.168.1.29:39033

# Push the newest .db from your downloads folder (one command per export):
debug-clone-tools/push-mapdb-to-clone.sh --latest

# Watch the folder and auto-push each new map.db the web app exports:
debug-clone-tools/push-mapdb-to-clone.sh --watch
```

`--latest`/`--watch` scan `~/Downloads` by default. Point `--dir` at wherever your
browser saves — on WSL that is usually a Windows folder, e.g.
`--dir /mnt/c/Users/YOU/Downloads`. `--watch` runs unattended (implies `--yes`)
and dedupes by SHA-256.

Alternatively, the privacy-patched clone exposes an **in-app `map.db` importer**
button, so you can also import a downloaded database directly on the phone.

## 3. Pull logs and sandbox data

[pull-potensicpro-logs.sh](pull-potensicpro-logs.sh) is **read-only**. It collects
device/app metadata, shared app storage, candidate log files, and — when `run-as`
is available — the private sandbox.

```bash
# Original package (shared storage only; sandbox needs a debuggable app):
debug-clone-tools/pull-potensicpro-logs.sh

# The debuggable clone (its own shared storage + sandbox):
debug-clone-tools/pull-potensicpro-logs.sh --debug-package

# Explicit wireless endpoint:
debug-clone-tools/pull-potensicpro-logs.sh --debug-package --device 192.168.1.29:38667
```

Output lands under `acquisitions/<package>-logs-YYYYMMDD-HHMMSS/`. The
`--debug-package` pull captures the clone; it does **not** read the Play Store
app's private `/data/data/com.ipotensic.potensicpro/databases/map.db`.

## Android compatibility warning

Launching the clone on recent Android builds may show:

```text
This app isn't 16 KB compatible. ELF alignment check failed.
```

This comes from native libraries bundled by the vendor APK (Mapbox, AMap, media,
PDF). It does not mean the Play Store app was modified or damaged.

## Clean generated output

Generated acquisitions and APK builds are not source artifacts:

```bash
rm -rf acquisitions debuggable-apk
```

## Typical workflow

1. `rm -rf acquisitions debuggable-apk` for a clean run.
2. Build the de-tracked clone:
   `debug-clone-tools/make-potensicpro-debuggable.sh --clone-package debug --privacy`.
3. Install the generated clone APK and verify `run-as`.
4. Plan a mission in the web app and **Export map.db**.
5. Push it: `debug-clone-tools/push-mapdb-to-clone.sh --latest` (or `--watch`),
   or use the clone's in-app importer.
6. Optionally pull logs/sandbox with
   `debug-clone-tools/pull-potensicpro-logs.sh --debug-package`.
7. Keep original-package replacement as a separate, destructive decision.
