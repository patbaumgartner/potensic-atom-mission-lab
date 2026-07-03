# Potensic Atom Waypoints

Research and tooling workspace for first-generation Potensic Atom waypoint work with the PotensicPro Android app. The current scripts support safe log acquisition, debuggable APK rebuilding, and side-by-side debug-clone testing for `run-as` and sandbox workflows.

See [PLAN.md](PLAN.md) for the broader mission-planner plan.

## Mission Lab App

A browser-first mission planner that programs a flight **form** (line, polygon, circle, survey grid, spiral, star, or a manual path) and exports a PotensicPro-compatible `map.db`. It uses the drone's native waypoint-mission execution — no live control-frame injection.

```bash
npm install
npm run dev      # start the planner at http://localhost:5173
npm test         # geometry + map.db generation tests
npm run build    # typecheck + production build
```

Key modules:

- `src/features/mission/geometry.ts` — geodesic math and flight-form generators.
- `src/features/mission/validator.ts` — conservative Atom constraints.
- `src/features/potensic/atomSchema.ts` — exact on-device `map.db` schema (verified: `user_version=5`, page size 4096, UTF-8).
- `src/features/potensic/atomMapDb.ts` — `map.db` generation and parsing via `sql.js`.

Atom limitation enforced in the UI: per-waypoint height/gimbal are **not** honored by the drone. Altitude is climbed to manually before starting; height/speed are mission metadata plus a generated field checklist.

## Deploy A Generated Mission

[debug-clone-tools/push-mapdb-to-clone.sh](debug-clone-tools/push-mapdb-to-clone.sh) writes a generated `map.db` into the debug clone sandbox, backup-first:

```bash
debug-clone-tools/push-mapdb-to-clone.sh \
  --map ~/Downloads/map.db \
  --device 192.168.1.29:39033
```

It backs up the current on-device `map.db`, force-stops the app, writes the new database binary-safely via Base64, and verifies size + SHA256. It refuses to target the non-debuggable Play Store package.

### Sync From The Web App

The browser can only *download* a `map.db` (it cannot write to the phone), so syncing is just automating the `adb` push. Instead of typing the filename each time:

```bash
# Push the newest .db from your downloads folder (one command per export):
debug-clone-tools/push-mapdb-to-clone.sh --latest

# Or watch the folder and auto-push the instant the web app exports a map.db:
debug-clone-tools/push-mapdb-to-clone.sh --watch
```

`--latest`/`--watch` scan `~/Downloads` by default. Point `--dir` at wherever your browser saves — on WSL that is usually the Windows folder, e.g. `--dir /mnt/c/Users/YOU/Downloads`. Every push is still backup-first; `--watch` runs unattended (implies `--yes`) and pushes each new/changed `.db` (deduped by SHA-256). For a fully deterministic filename, set your browser to save to that folder (or use its "Ask where to save" option) so each export lands as `map.db`.

## Tool Defaults

The scripts are set up for WSL/Linux using Windows-installed Android tools.

```bash
ADB=/mnt/c/ProgramData/chocolatey/bin/adb.exe
ANDROID_SDK=/mnt/c/Android/android-sdk
BUILD_TOOLS=/mnt/c/Android/android-sdk/build-tools/36.0.0
```

Default packages:

```text
Original app: com.ipotensic.potensicpro
Debug clone:  com.ipotensic.potensicpro.debug
```

Wireless Debugging ports rotate. If `adb devices -l` already shows one connected device, both scripts can use it automatically. Otherwise pass `--device HOST:PORT` or `--connect HOST:PORT`.

## Clean Generated Output

Generated acquisitions and APK builds are intentionally not source artifacts. Remove them when you want a clean run:

```bash
rm -rf acquisitions debuggable-apk
```

## Pull Logs And Sandbox Data

[debug-clone-tools/pull-potensicpro-logs.sh](debug-clone-tools/pull-potensicpro-logs.sh) is read-only. It collects app/device metadata, shared app storage, candidate log files, and private sandbox data when `run-as` is available.

Run with defaults against the original package and the first connected ADB device:

```bash
debug-clone-tools/pull-potensicpro-logs.sh
```

Run against the side-by-side debug clone:

```bash
debug-clone-tools/pull-potensicpro-logs.sh --debug-package
```

Run with an explicit wireless ADB endpoint:

```bash
debug-clone-tools/pull-potensicpro-logs.sh \
  --debug-package \
  --device 192.168.1.29:38667
```

The default original-package pull writes output like:

```text
acquisitions/com.ipotensic.potensicpro-logs-YYYYMMDD-HHMMSS/
```

The debug-package pull captures `com.ipotensic.potensicpro.debug`. It is useful for testing `run-as`, sandbox backup, and generated `map.db` upload mechanics. It does not read the Play Store app's private `/data/data/com.ipotensic.potensicpro/databases/map.db`.

The debug-package pull writes output like:

```text
acquisitions/com.ipotensic.potensicpro.debug-logs-YYYYMMDD-HHMMSS/
```

## Build Debuggable APKs

[debug-clone-tools/make-potensicpro-debuggable.sh](debug-clone-tools/make-potensicpro-debuggable.sh) can now run with defaults. With no APK input path, it pulls the installed PotensicPro APK set from the connected phone, patches the base APK to `android:debuggable="true"`, rebuilds/signs it, and writes output under `debuggable-apk/`.

Run with defaults:

```bash
debug-clone-tools/make-potensicpro-debuggable.sh
```

Run with an explicit device:

```bash
debug-clone-tools/make-potensicpro-debuggable.sh \
  --device 192.168.1.29:38667
```

Expected generated output pattern:

```text
debuggable-apk/potensicpro-debuggable-YYYYMMDD-HHMMSS/
```

This original-package build is useful for replacing the Play Store app only if you accept the signature/data-loss risk. A locally signed APK usually cannot update the Play Store install because the signing certificate differs. Installing may require uninstalling the original app, which deletes private data.

## Build The Side-By-Side Clone

Use the clone mode to create a debuggable package that installs next to the Play Store app:

```bash
debug-clone-tools/make-potensicpro-debuggable.sh \
  --clone-package debug
```

`debug` expands to:

```text
com.ipotensic.potensicpro.debug
```

The default clone label is:

```text
My Atom
```

That label makes Android chooser dialogs such as `Choose an app for the USB device` distinguish the clone from the original app. Override it if needed:

```bash
debug-clone-tools/make-potensicpro-debuggable.sh \
  --clone-package debug \
  --clone-label "My Atom"
```

Build a de-tracked clone (rename to `My Atom`, strip the Bugly and Mapbox telemetry trackers, and disable the in-app self-update check):

```bash
debug-clone-tools/make-potensicpro-debuggable.sh \
  --clone-package debug \
  --privacy
```

Install the generated clone APK:

```bash
/mnt/c/ProgramData/chocolatey/bin/adb.exe install -r \
  debuggable-apk/.../signed/potensicpro-debug-clone.apk
```

After install, verify `run-as`:

```bash
/mnt/c/ProgramData/chocolatey/bin/adb.exe shell \
  run-as com.ipotensic.potensicpro.debug pwd
```

Expected output:

```text
/data/user/0/com.ipotensic.potensicpro.debug
```

The clone has its own sandbox:

```text
Original data: /data/data/com.ipotensic.potensicpro/...
Clone data:    /data/data/com.ipotensic.potensicpro.debug/...
```

So the clone is safe for testing upload/pull mechanics, but it cannot recover the original app's private `map.db`.

## Android Compatibility Warning

Recent Android builds may show an `Android App Compatibility` warning when launching the debug clone:

```text
This app isn't 16 KB compatible. ELF alignment check failed.
```

This warning comes from native libraries bundled by the vendor APK, such as Mapbox, AMap, media, and PDF libraries. It does not mean the Play Store app was modified or damaged.

## Current Practical Workflow

1. Clean generated output with `rm -rf acquisitions debuggable-apk`.
2. Run `debug-clone-tools/make-potensicpro-debuggable.sh --clone-package debug --privacy` to rebuild the de-tracked side-by-side `My Atom` clone.
3. Install the generated clone APK.
4. Run `debug-clone-tools/pull-potensicpro-logs.sh --debug-package` to pull the clone logs and sandbox.
5. Use the clone sandbox to test generated `map.db` upload mechanics.
6. Treat original-package replacement as a separate decision because it may delete the original private `map.db`.