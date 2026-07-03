// Generate and parse PotensicPro (Atom) map.db files using sql.js.
//
// The sql.js module is injected (SqlJsStatic) so this file works unchanged in
// the browser (wasm loaded via URL) and in Node tests (wasm loaded from disk).

import type { Database, SqlJsStatic } from "sql.js";
import { chunkWaypoints, pathLengthMeters } from "../mission/geometry";
import type { Mission, Waypoint } from "../mission/missionTypes";
import {
  ATOM_CREATE_STATEMENTS,
  ATOM_LOCALE,
  ATOM_PAGE_SIZE,
  ATOM_TABLE_SCHEMA_SEED,
  ATOM_USER_VERSION,
} from "./atomSchema";

export interface GenerateOptions {
  /** Max waypoints per flight record (chunk). Default 45. */
  chunkSize?: number;
}

export interface ParsedFlightRecord {
  id: number;
  label: string;
  durationSeconds: number;
  heightM: number;
  mileageM: number;
  waypointCount: number;
  speedMs: number;
  waypoints: Waypoint[];
}

export interface ParsedMapDb {
  userVersion: number;
  tables: string[];
  records: ParsedFlightRecord[];
}

function applySchema(db: Database): void {
  db.run(`PRAGMA page_size = ${ATOM_PAGE_SIZE}`);
  db.run("PRAGMA encoding = 'UTF-8'");
  for (const stmt of ATOM_CREATE_STATEMENTS) db.run(stmt);
  db.run("INSERT INTO android_metadata (locale) VALUES (?)", [ATOM_LOCALE]);
  const insSchema = db.prepare(
    "INSERT INTO table_schema (name, type) VALUES (?, ?)",
  );
  for (const row of ATOM_TABLE_SCHEMA_SEED) insSchema.run([row.name, row.type]);
  insSchema.free();
  db.run(`PRAGMA user_version = ${ATOM_USER_VERSION}`);
}

/**
 * Build a PotensicPro-compatible map.db from one or more missions.
 * Each mission is chunked into flightrecordbean rows (<= chunkSize waypoints),
 * with linked multipointbean rows preserving order.
 */
export function generateMapDb(
  SQL: SqlJsStatic,
  missions: Mission[],
  options: GenerateOptions = {},
): Uint8Array {
  const chunkSize = options.chunkSize ?? 45;
  const db = new SQL.Database();
  try {
    applySchema(db);

    const insRecord = db.prepare(
      "INSERT INTO flightrecordbean (date, duration, height, mileage, num, speed) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const insPoint = db.prepare(
      "INSERT INTO multipointbean (flightrecordbean_id, lat, lng) VALUES (?, ?, ?)",
    );

    for (const mission of missions) {
      const name = mission.name.trim() || "mission";
      const chunks = chunkWaypoints(name, mission.waypoints, chunkSize);
      for (const chunk of chunks) {
        const mileageM = pathLengthMeters(chunk.waypoints);
        const durationSeconds =
          mission.plannedSpeedMs > 0 ? mileageM / mission.plannedSpeedMs : 0;
        insRecord.run([
          chunk.label,
          Math.round(durationSeconds),
          String(mission.plannedHeightM),
          mileageM.toFixed(1),
          chunk.waypoints.length,
          String(mission.plannedSpeedMs),
        ]);
        const recordId = readLastRowId(db);
        for (const wp of chunk.waypoints) {
          insPoint.run([recordId, wp.lat, wp.lng]);
        }
      }
    }

    insRecord.free();
    insPoint.free();
    return db.export();
  } finally {
    db.close();
  }
}

function readLastRowId(db: Database): number {
  const res = db.exec("SELECT last_insert_rowid()");
  return Number(res[0].values[0][0]);
}

/** Parse a map.db back into flight records and waypoints (round-trip / inspector). */
export function parseMapDb(SQL: SqlJsStatic, bytes: Uint8Array): ParsedMapDb {
  const db = new SQL.Database(bytes);
  try {
    const userVersion = Number(db.exec("PRAGMA user_version")[0].values[0][0]);
    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]
      .values.map((r) => String(r[0]));

    const records: ParsedFlightRecord[] = [];
    const recRes = db.exec(
      "SELECT id, date, duration, height, mileage, num, speed FROM flightrecordbean ORDER BY id",
    );
    const rows = recRes[0]?.values ?? [];
    for (const row of rows) {
      const id = Number(row[0]);
      const ptRes = db.exec(
        `SELECT lat, lng FROM multipointbean WHERE flightrecordbean_id = ${id} ORDER BY id`,
      );
      const waypoints: Waypoint[] = (ptRes[0]?.values ?? []).map((p) => ({
        lat: Number(p[0]),
        lng: Number(p[1]),
      }));
      records.push({
        id,
        label: String(row[1] ?? ""),
        durationSeconds: Number(row[2] ?? 0),
        heightM: Number(row[3] ?? 0),
        mileageM: Number(row[4] ?? 0),
        waypointCount: Number(row[5] ?? 0),
        speedMs: Number(row[6] ?? 0),
        waypoints,
      });
    }

    return { userVersion, tables, records };
  } finally {
    db.close();
  }
}
