# Atom Mission Lab Plan

Build an Atom-native web application for planning waypoint missions, generating PotensicPro-compatible `map.db` files, analyzing post-flight logs, and conducting controlled protocol inspection research. The project should work with first-generation Potensic Atom and PotensicPro (`com.ipotensic.potensicpro`) rather than assuming Atom 2/Potensic Eve capabilities.

## TL;DR

Create a browser-first mission lab with three production tracks and one research track: (1) draw/code paths and export Atom `map.db`, (2) inspect/backup/diff mission databases, (3) import logs and compare planned vs actual flights, and (4) investigate Atom app/controller protocol read-only first, inspired by `sk7n4k3d/potensic-proxy` but not copied from Atom 2. Do not build live steering in the MVP.

## Scope

- Included: web mission planner, point/line/curve/path editing, mission chunking, Atom SQLite `map.db` generator, `map.db` inspector, backup/restore workflow, log analyzer, planned-vs-actual reports, protocol inspection workspace.
- Excluded for MVP: live joystick control, firmware modification, app patch distribution, bypassing flight limits, Atom 2 JSON mission generation, mid-air code execution, automatic per-waypoint gimbal/photo commands for Atom unless proven by research.

## Known Atom Constraints

- PotensicPro stores waypoint missions in `/data/data/com.ipotensic.potensicpro/databases/map.db`.
- DroneTM and community research indicate the key tables are `flightrecordbean` and `multipointbean`.
- `multipointbean` stores waypoint coordinates as latitude/longitude pairs.
- `flightrecordbean` metadata such as height/speed appears informational for Atom.
- Practical waypoint limit is approximately 45-50 per flight record; use conservative chunking.
- Mission altitude must be set manually by flying to the desired altitude before starting the mission.
- Gimbal angle must be set manually.
- Photos must use PotensicPro interval timer; true per-waypoint photo actions are not currently proven for Atom.
- Accessing app sandbox storage requires root, a debuggable build, `run-as`, or a modified workflow.

## Architecture

1. Browser app: Vite + React + TypeScript, MapLibre GL or Leaflet, Turf.js for geometry, local-first state, responsive field UI.
2. Core mission library: pure TypeScript modules for route editing, curve sampling, distance estimates, chunking, validation, and export models.
3. SQLite generation: browser-side SQLite using `sql.js` or `wa-sqlite` to generate downloadable `map.db`; optional Node helper only if browser SQLite proves painful.
4. Optional device bridge: WebADB/Tango or local CLI helper for backing up and writing `map.db`; keep manual export usable without ADB.
5. Log analyzer: start with a Python/CLI adapter around Koen Aerts-style parsing if reuse is practical; expose parsed JSON/GeoJSON/CSV to the web UI.
6. Protocol inspector: separate research module for APK notes, logcat captures, packet captures, and protocol notes; read-only by default.

## Steps

### 1. Baseline Reference Collection

- Gather at least 3 real Atom `map.db` files: empty/default, manually created waypoint mission, and mission with maximum practical points.
- Gather at least 2 Atom flight log exports from PotensicPro.
- Use Windows ADB early to pull any existing mission database and previous-flight data before PotensicPro or the phone clears it.
- Capture both app-sandbox data, when `run-as com.ipotensic.potensicpro` works, and shared/external app folders, when Android exposes them.
- Record PotensicPro app version, phone OS, drone firmware, controller type, and whether `adb shell run-as com.ipotensic.potensicpro` works.
- Output: anonymized fixture set, raw acquisition archive, and `docs/reference-observations.md`.

### 2. Schema And Fixture Validation

- Recreate the Atom SQLite structure used by DroneTM: `android_metadata`, `table_schema`, `flightrecordbean`, `multipointbean`, and supporting tables needed for compatibility.
- Confirm required PRAGMA values: `user_version = 5` and `schema_version = 22` unless fixtures prove otherwise.
- Confirm coordinate order: GeoJSON uses lon/lat; `multipointbean` stores `lat`, `lng`.
- Confirm what `flightrecordbean.height`, `speed`, `duration`, `mileage`, `num`, and `date` actually affect in PotensicPro UI.
- Output: `docs/atom-mapdb-schema.md`, fixtures, and schema tests.

### 3. Mission Planner MVP

- Build the web shell with a map, mission list, mission metadata panel, and export panel.
- Implement drawing modes: point-by-point path, line/polyline path, curve/spline path sampled into waypoints, and imported GeoJSON/CSV/GPX path.
- Show directional arrows, waypoint numbers, total distance, estimated duration, point count, and chunk count.
- Add conservative validation: coordinate bounds, duplicate points, too-close points, max 45 waypoints per chunk, warnings above 40, hard stop above configured safe limit unless auto-chunking is enabled.
- Output: local mission planner that exports GeoJSON and a draft `map.db`.

### 4. Atom `map.db` Generator

- Convert validated mission geometry into one or more `flightrecordbean` rows and linked `multipointbean` rows.
- Use chunking as the default: 10-point chunks for resumability or configurable up to 45 after testing.
- Preserve a clean mission naming convention in `flightrecordbean.date`, such as `mission-name 001-010`, since Atom labels are limited.
- Add exports: `map.db`, GeoJSON, CSV, and a markdown field checklist.
- Output: downloadable `map.db` files that pass schema validation and open in the inspector.

### 5. Database Inspector And Backup Workflow

- Add drag/drop import for existing `map.db`.
- Display tables, PRAGMA values, flight records, waypoint counts, and map previews.
- Add diff view between two `map.db` files: added/removed missions, changed metadata, changed coordinates.
- Add backup metadata: timestamp, source device/app version, SHA256, notes.
- Add guarded restore/export workflow: never overwrite without backup and confirmation.
- Output: inspector usable before any device write is attempted.

### 6. Optional Device Transfer Layer

- Implement manual-first workflow: download `map.db`, then show exact safe transfer instructions.
- Add WebADB/Tango or local CLI helper only after manual export works.
- Commands to support: force-stop PotensicPro, backup current `map.db` via base64, remove `map.db-journal`, write new `map.db`, verify file size/hash when possible.
- Add capability check: detect whether `run-as com.ipotensic.potensicpro` works; otherwise mark device transfer unavailable.
- Add a Windows PowerShell acquisition script that runs before any write workflow and copies retained flight data if present.
- Document PowerShell-safe binary handling: prefer `adb exec-out ... base64` followed by local Base64 decoding instead of redirecting raw SQLite/log bytes through PowerShell.
- Search likely retained-data locations, including PotensicPro sandbox paths via `run-as` and shared storage under `/sdcard/Android/data/com.ipotensic.potensicpro/` when accessible.
- Output: backup-first device workflow with clear failure states.

### 7. Log Analyzer MVP

- Determine which parser route is best for Atom: reuse Koen Aerts' parsing logic by wrapping it, port the needed parser to a small Python helper, or parse exported CSV/KML if the user already uses Flight Log Viewer.
- Import Atom logs or exported CSV/KML into the app.
- Import Windows ADB acquisition bundles so previous-flight data pulled from the phone can be inspected before deciding whether a direct parser or Koen-export workflow is needed.
- Render actual flight path on the same map as the planned mission.
- Show timeline, altitude, speed, distance, battery if available, GPS/position mode if available, and event markers such as RTH or landing if parsed.
- Export parsed logs as GeoJSON, CSV, and KML.
- Output: post-flight replay and basic statistics.

### 8. Planned Vs Actual Analysis

- Match actual path to planned route using nearest-point-on-line and waypoint proximity checks.
- Report maximum lateral deviation, average deviation, actual duration, estimated vs actual speed, altitude range, missed waypoint candidates, and early stop/RTH candidates.
- Generate a mission quality report after each flight.
- Use this report to tune waypoint spacing, chunk size, speed assumptions, and field workflow.
- Output: actionable flight validation report.

### 9. Atom Protocol Inspector Research Track

- Keep this as a separate tab and code boundary from mission generation.
- Start with read-only sources: PotensicPro APK decompilation notes, logcat capture, app storage inspection, generated `map.db` diffs, and post-flight logs.
- Investigate whether Atom uses USB AOA, WiFi, BLE, or another phone-controller transport comparable to Atom 2.
- Build a packet/note viewer with timestamped captures, hex annotation, suspected frame types, checksums, and links to observed user action.
- Use `sk7n4k3d/potensic-proxy` only as a structural inspiration: architecture, protocol note format, telemetry table style, and staged safety gates. Do not assume Atom 2 packet formats apply to Atom.
- Output: `docs/atom-protocol-notes.md` and read-only capture tooling if feasible.

### 10. Field Workflow And Safety UX

- Add a field checklist generated with each mission: backup DB, transfer DB, open PotensicPro, select mission/chunk, manually climb to altitude, manually set gimbal, enable interval photos, start mission, monitor line of sight, stop interval photos, return home, import logs.
- Add prominent Atom limitation warnings without blocking normal expert workflow.
- Add no-fly-zone and legal reminders as user-configurable checkboxes, not automated bypass tools.
- Output: practical field-ready workflow.

### 11. Documentation And Review Package

- Create final docs: `README.md`, `docs/atom-mapdb-schema.md`, `docs/field-workflow.md`, `docs/log-analysis.md`, `docs/protocol-inspector.md`, `docs/safety.md`.
- Include fixture provenance and anonymization rules.
- Include explicit unsupported features for Atom: per-waypoint altitude, automatic gimbal, waypoint photos, live joystick control.
- Output: reviewable project documentation and issue backlog.

## Relevant Files To Create

- `PLAN.md` - project plan and milestone checklist.
- `package.json` - app scripts and dependencies.
- `src/App.tsx` - top-level app shell and navigation.
- `src/features/mission/MissionEditor.tsx` - map drawing and mission editing UI.
- `src/features/mission/missionTypes.ts` - mission, waypoint, chunk, validation types.
- `src/features/mission/geometry.ts` - line/curve/path sampling, distances, bearings.
- `src/features/mission/validator.ts` - Atom mission constraints and warnings.
- `src/features/potensic/atomMapDb.ts` - SQLite generation and parsing for Atom `map.db`.
- `src/features/potensic/atomSchema.ts` - expected tables, PRAGMAs, compatibility checks.
- `src/features/inspector/DbInspector.tsx` - upload, table view, mission map, diff UI.
- `src/features/device/adbTransfer.ts` - optional WebADB/local helper integration.
- `scripts/windows/pull-atom-data.ps1` - Windows ADB acquisition helper for `map.db`, shared app files, and retained flight logs.
- `src/features/logs/LogAnalyzer.tsx` - flight log upload, replay, charts.
- `src/features/logs/logTypes.ts` - normalized flight log model.
- `src/features/logs/plannedVsActual.ts` - deviation and quality report calculations.
- `src/features/protocol/ProtocolInspector.tsx` - capture/note viewer for Atom protocol research.
- `docs/atom-mapdb-schema.md` - schema documentation.
- `docs/field-workflow.md` - operational checklist.
- `docs/windows-adb-data-acquisition.md` - Windows ADB setup, pull commands, Base64 decoding, and retained-data locations.
- `docs/protocol-inspector.md` - Atom protocol research notes.
- `fixtures/` - anonymized `map.db`, mission GeoJSON, and log samples.

## Verification

1. Schema fixture tests: generated `map.db` has required tables, PRAGMAs, valid `flightrecordbean` rows, valid `multipointbean` rows, and correct coordinate order.
2. Round-trip tests: mission -> `map.db` -> inspector -> mission model yields equivalent waypoints and metadata.
3. Boundary tests: 0 points, 1 point, 45 points, 46+ points, duplicate points, invalid lat/lng, extremely close points, long mission chunking.
4. Manual PotensicPro test: generated `map.db` appears in PotensicPro mission list and displays the expected route.
5. Field test escalation: tabletop/no-prop workflow where possible, tiny open-field mission, then larger route, then mapping/creative paths.
6. Log parser tests: known Atom logs parse to sane coordinate/time ranges and export GeoJSON/KML/CSV.
7. Planned-vs-actual tests: synthetic paths produce expected deviation metrics; real flight logs produce stable reports.
8. Device transfer tests: backup always occurs before write; hash/file size checks run; failures leave a restorable backup.
9. Windows ADB acquisition tests: script detects connected devices, records capability checks, pulls `map.db` when possible, copies shared app folders when available, and never writes to the device.
10. Protocol inspector tests: all capture/import paths are read-only by default; no control packet sending in MVP.

## Decisions

- Build Atom first; Atom 2 support is intentionally excluded from MVP despite richer capabilities.
- Keep app browser-first and local-first; add native/local helpers only for ADB or Python log parsing when needed.
- Treat altitude, speed, and gimbal values as field workflow metadata unless hands-on testing proves Atom honors them.
- Use interval photography for Atom mapping workflows; do not claim per-waypoint photos.
- Keep protocol inspection separate from mission generation so safety-critical research cannot accidentally affect normal mission planning.
- Prefer read-only inspection before write workflows; prefer backup-first write workflows before any field test.
- Run the Windows ADB acquisition workflow before any database write, so previous missions/logs are preserved if the phone still has them.

## Risks

1. `map.db` compatibility varies by PotensicPro version. Mitigation: fixture matrix by app/drone firmware and schema compatibility reports.
2. Generated DB corrupts existing missions. Mitigation: mandatory backup, hash, restore instructions, and write confirmation.
3. User assumes metadata controls altitude/gimbal. Mitigation: UI labels these as reminders/display values until proven otherwise.
4. Flight route differs from preview due to wind, GPS, app behavior, or chunking. Mitigation: conservative first tests and planned-vs-actual reports.
5. ADB access is unavailable on the user's phone. Mitigation: manual export/import docs and optional debuggable/root notes without requiring them.
6. Atom protocol differs radically from Atom 2. Mitigation: protocol inspector is research-only and does not block mission planner MVP.
7. Reverse-engineering/legal concerns. Mitigation: do not distribute proprietary APKs, do not bypass safety/geofence systems, document research boundaries.
8. Previous flight data has already been cleared by PotensicPro or Android storage cleanup. Mitigation: run Windows ADB acquisition immediately, archive whatever exists, and support manual PotensicPro log export as a fallback.

## Further Considerations

1. Log parser implementation path: recommended start by consuming Koen Flight Log Viewer CSV/KML exports, then port/reuse parser logic only if direct import is needed.
2. Map library: MapLibre gives richer future UX; Leaflet is simpler and faster for MVP. Recommendation: Leaflet for MVP unless 3D/terrain preview becomes important.
3. Transfer approach: manual download first; WebADB second; local CLI third if browser ADB proves unreliable.
4. Protocol track: begin with APK/class notes and logcat; only attempt USB capture after the mission planner and log analyzer are useful.