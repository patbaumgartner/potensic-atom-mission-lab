// Generate a sample Atom map.db from a chosen flight form using the app's own
// modules, so the fixture always matches the shipped generator.
//
//   npx tsx scripts/generate-sample-mapdb.ts [form] [radiusM] [points]
//
// Examples:
//   npx tsx scripts/generate-sample-mapdb.ts circle 30 12
//   npx tsx scripts/generate-sample-mapdb.ts polygon 40 5
import { mkdirSync, writeFileSync } from "node:fs";
import {
  buildForm,
  DEFAULT_FORM_PARAMS,
  type FormKind,
} from "../src/features/mission/formBuilder";
import type { Mission } from "../src/features/mission/missionTypes";
import { pathLengthMeters } from "../src/features/mission/geometry";
import { generateMapDb, parseMapDb } from "../src/features/potensic/atomMapDb";
import { loadSqlNode } from "../src/features/potensic/sqlLoaderNode";

const kind = (process.argv[2] as FormKind) ?? "circle";
const radiusM = Number(process.argv[3] ?? 30);
const points = Number(process.argv[4] ?? 12);

const waypoints = buildForm({
  ...DEFAULT_FORM_PARAMS,
  kind,
  radiusM,
  points,
  sides: points,
});

const mission: Mission = {
  name: `sample-${kind}`,
  waypoints,
  plannedHeightM: 20,
  plannedSpeedMs: 5,
};

const SQL = await loadSqlNode();
const bytes = generateMapDb(SQL, [mission]);

mkdirSync("fixtures", { recursive: true });
const out = "fixtures/sample-map.db";
writeFileSync(out, bytes);

// Read it back to confirm it is a valid, parseable Atom database.
const parsed = parseMapDb(SQL, bytes);
const rec = parsed.records[0];
console.log(`Wrote ${out} (${bytes.length} bytes)`);
console.log(
  `  form=${kind} waypoints=${waypoints.length} distance=${pathLengthMeters(waypoints).toFixed(0)} m`,
);
console.log(
  `  user_version=${parsed.userVersion} records=${parsed.records.length} label="${rec?.label}"`,
);
