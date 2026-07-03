# Atom Mission Lab

[![CI](https://github.com/patbaumgartner/potensic-atom-mission-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/patbaumgartner/potensic-atom-mission-lab/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/patbaumgartner/potensic-atom-mission-lab/actions/workflows/deploy.yml/badge.svg)](https://github.com/patbaumgartner/potensic-atom-mission-lab/actions/workflows/deploy.yml)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](vite.config.ts)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![React](https://img.shields.io/badge/React-18-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet&logoColor=white)

**[▶ Live demo](https://patbaumgartner.github.io/potensic-atom-mission-lab/)**

A browser-first mission planner for the first-generation **Potensic Atom** and the
**PotensicPro** Android app. Draw or code waypoint patterns, preview them on a
satellite map, and export a PotensicPro-compatible `map.db` you can load on the
drone. It uses the drone's **native waypoint-mission execution** — there is no
live control-frame injection.

> Device-side tooling (debuggable APK, side-by-side clone, log pulls, pushing a
> generated `map.db` to the phone) lives in
> [debug-clone-tools/README.md](debug-clone-tools/README.md).

## Features

- **Flight forms** — line, polygon, circle, survey grid (lawnmower), spiral,
  star, and free-hand manual paths.
- **Location search** — geocode any address/place, fly the map there, and show a
  concise Swiss-style address (`Street Nr, PLZ City`).
- **Direct editing** — drag a resize handle to grow/shrink a form, a rotate
  slider to spin it, drag individual waypoints, and convert any form to editable
  points. Reverse, mirror, close-loop, and full undo/redo.
- **Mission library** — keep several missions (each its own color), edit them
  with live sync, and export them all into one `map.db` (each as its own
  PotensicPro route). Everything persists in `localStorage`.
- **Safety & battery** — endurance estimate for ~20 min packs (with reserve),
  max-distance-from-home, and a geofence with in-UI warnings.
- **Analysis** — import an actual flown track (GPX / GeoJSON / CSV) and compare
  planned vs actual (max/average deviation, distances).
- **Inspect & export** — drag-drop an existing `map.db` to view its records, and
  export `map.db`, GeoJSON, or a markdown field checklist.

## Getting started

```bash
npm install
npm run dev            # start the planner at http://localhost:5173
```

Other scripts:

```bash
npm run build          # typecheck + production build
npm test               # run the unit tests
npm run test:coverage  # tests with a 100% coverage gate
npm run generate:sample -- circle 30 12   # write fixtures/sample-map.db
```

## How it works

1. Search a location (or click the map) to set where the mission is planned.
2. Pick a form and adjust its parameters, or draw a manual path.
3. Review the stats and safety warnings, then **Export map.db**.
4. Load the `map.db` onto the drone using the
   [device tooling](debug-clone-tools/README.md), or open PotensicPro and select
   the mission.

### Atom 1 constraints (enforced in the UI)

- The **2D form/path is fully programmable**.
- **Per-waypoint height and gimbal are NOT honored** by Atom 1 — you climb to the
  target altitude manually before starting. Height/speed are stored as mission
  metadata and appear in the generated field checklist.
- Practical cap of ~45 waypoints per flight record; larger missions auto-chunk.

## Project structure

```text
src/
  App.tsx                       app shell + all UI state
  main.tsx                      React entry point
  styles.css                    theme + layout
  features/
    mission/
      geometry.ts               geodesic math + flight-form generators
      formBuilder.ts            build waypoints from a form + parameters
      validator.ts              conservative Atom mission constraints
      missionTypes.ts           mission/waypoint types + limits
      MapView.tsx               Leaflet map, overlays, drag/fly interactions
    potensic/
      atomSchema.ts             exact on-device map.db schema
      atomMapDb.ts              map.db generation + parsing (sql.js)
      sqlLoader.ts              browser sql.js loader (wasm)
      sqlLoaderNode.ts          Node sql.js loader (tests)
    geo/formatAddress.ts        Nominatim address → Swiss address
    logs/trackImport.ts         GPX / GeoJSON / CSV track parser
    export.ts                   GeoJSON + file-download helpers
tests/                          unit tests (100% coverage on logic modules)
scripts/generate-sample-mapdb.ts   CLI to emit a sample map.db
fixtures/                       generated sample databases
```

## Tech stack

- **Vite + React + TypeScript**
- **Leaflet** for the map (OpenStreetMap + Esri satellite tiles)
- **sql.js** (SQLite compiled to WebAssembly) for reading/writing `map.db`
- **Nominatim** (OpenStreetMap) for geocoding
- **Vitest** for unit tests

## Testing & coverage

All pure-logic modules are unit-tested to **100%** statements, branches,
functions, and lines, enforced by a coverage gate in
[vite.config.ts](vite.config.ts). The UI-integration files (`App.tsx`,
`MapView.tsx`, `main.tsx`, and the browser `sqlLoader.ts`) require a live
DOM/map and are validated interactively rather than in unit tests, so they are
excluded from the coverage gate.

```bash
npm run test:coverage
```

## Deployment

Every push to `main` builds the app and publishes it to **GitHub Pages** via the
[deploy workflow](.github/workflows/deploy.yml). Enable it once under
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The live
build is at
<https://patbaumgartner.github.io/potensic-atom-mission-lab/>.

## Contributing

Issues and pull requests are welcome. Before opening a PR, please make sure the
checks pass locally:

```bash
npm run typecheck
npm run test:coverage   # must stay at 100% on logic modules
npm run build
```

## Disclaimer

This is an independent research/hobby project and is **not affiliated with
Potensic**. It plans missions the drone executes natively; it does not modify
firmware or bypass flight limits, geofencing, or safety systems. You are
responsible for flying legally and safely — mind local drone regulations,
airspace, and line of sight.

## License

[MIT](LICENSE) © Patrick Baumgartner
