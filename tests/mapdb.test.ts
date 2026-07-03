import { describe, expect, it } from "vitest";
import { circleForm, destinationPoint } from "../src/features/mission/geometry";
import type { Mission, Waypoint } from "../src/features/mission/missionTypes";
import {
  generateMapDb,
  parseMapDb,
} from "../src/features/potensic/atomMapDb";
import {
  ATOM_REQUIRED_TABLES,
  ATOM_USER_VERSION,
} from "../src/features/potensic/atomSchema";
import { loadSqlNode } from "../src/features/potensic/sqlLoaderNode";

const ORIGIN: Waypoint = { lat: 47.4150833, lng: 9.3953087 };

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    name: "test-loop",
    waypoints: circleForm(ORIGIN, 30, 8),
    plannedHeightM: 20,
    plannedSpeedMs: 5,
    ...overrides,
  };
}

describe("map.db generation", () => {
  it("produces a valid SQLite file with the required schema", async () => {
    const SQL = await loadSqlNode();
    const bytes = generateMapDb(SQL, [mission()]);

    // SQLite magic header.
    const header = new TextDecoder().decode(bytes.slice(0, 15));
    expect(header).toBe("SQLite format 3");

    const parsed = parseMapDb(SQL, bytes);
    expect(parsed.userVersion).toBe(ATOM_USER_VERSION);
    for (const t of ATOM_REQUIRED_TABLES) {
      expect(parsed.tables).toContain(t);
    }
  });

  it("round-trips waypoints in order with correct lat/lng", async () => {
    const SQL = await loadSqlNode();
    const m = mission();
    const bytes = generateMapDb(SQL, [m]);
    const parsed = parseMapDb(SQL, bytes);

    expect(parsed.records).toHaveLength(1);
    const rec = parsed.records[0];
    expect(rec.label).toBe("test-loop");
    expect(rec.waypointCount).toBe(m.waypoints.length);
    expect(rec.waypoints).toHaveLength(m.waypoints.length);
    rec.waypoints.forEach((wp, i) => {
      expect(wp.lat).toBeCloseTo(m.waypoints[i].lat, 9);
      expect(wp.lng).toBeCloseTo(m.waypoints[i].lng, 9);
    });
  });

  it("chunks large missions into multiple flight records", async () => {
    const SQL = await loadSqlNode();
    const wps = Array.from({ length: 92 }, (_, i) =>
      destinationPoint(ORIGIN, i * 3, 15 + i),
    );
    const bytes = generateMapDb(SQL, [mission({ name: "big", waypoints: wps })]);
    const parsed = parseMapDb(SQL, bytes);

    expect(parsed.records).toHaveLength(3);
    expect(parsed.records[0].label).toBe("big 001-045");
    expect(parsed.records[2].label).toBe("big 091-092");
    const total = parsed.records.reduce((n, r) => n + r.waypoints.length, 0);
    expect(total).toBe(92);
  });

  it("handles an empty mission list (schema-only db)", async () => {
    const SQL = await loadSqlNode();
    const bytes = generateMapDb(SQL, []);
    const parsed = parseMapDb(SQL, bytes);
    expect(parsed.records).toHaveLength(0);
    expect(parsed.tables).toContain("multipointbean");
  });

  it("stores multiple missions as separate flight records", async () => {
    const SQL = await loadSqlNode();
    const m1 = mission({ name: "Alpha" });
    const m2 = mission({ name: "Bravo", waypoints: circleForm(ORIGIN, 50, 6) });
    const bytes = generateMapDb(SQL, [m1, m2]);
    const parsed = parseMapDb(SQL, bytes);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records.map((r) => r.label)).toEqual(["Alpha", "Bravo"]);
    expect(parsed.records[0].waypoints.length).toBe(m1.waypoints.length);
    expect(parsed.records[1].waypoints.length).toBe(m2.waypoints.length);
  });

  it("preserves lat/lng order (multipointbean stores lat then lng)", async () => {
    const SQL = await loadSqlNode();
    const wp = { lat: 47.4162345, lng: 9.3971234 };
    const bytes = generateMapDb(SQL, [
      mission({ name: "order", waypoints: [wp, ORIGIN] }),
    ]);
    const parsed = parseMapDb(SQL, bytes);
    const first = parsed.records[0].waypoints[0];
    expect(first.lat).toBeCloseTo(wp.lat, 7);
    expect(first.lng).toBeCloseTo(wp.lng, 7);
  });

  it("chunks each mission independently within a multi-mission db", async () => {
    const SQL = await loadSqlNode();
    const big = Array.from({ length: 50 }, (_, i) =>
      destinationPoint(ORIGIN, i * 2, 15 + i),
    );
    const bytes = generateMapDb(SQL, [
      mission({ name: "small" }),
      mission({ name: "big", waypoints: big }),
    ]);
    const parsed = parseMapDb(SQL, bytes);
    // small (1 record) + big (2 records: 45 + 5).
    expect(parsed.records).toHaveLength(3);
    expect(parsed.records.map((r) => r.label)).toEqual([
      "small",
      "big 001-045",
      "big 046-050",
    ]);
  });

  it("defaults an unnamed mission label and zeroes duration at zero speed", async () => {
    const SQL = await loadSqlNode();
    const bytes = generateMapDb(SQL, [
      {
        name: "  ",
        waypoints: circleForm(ORIGIN, 20, 5),
        plannedHeightM: 0,
        plannedSpeedMs: 0,
      },
    ]);
    const parsed = parseMapDb(SQL, bytes);
    expect(parsed.records[0].label).toBe("mission");
    expect(parsed.records[0].durationSeconds).toBe(0);
    expect(parsed.records[0].speedMs).toBe(0);
  });

  it("parses a record with null fields and no waypoints", async () => {
    const SQL = await loadSqlNode();
    const db = new SQL.Database(generateMapDb(SQL, []));
    db.run(
      "INSERT INTO flightrecordbean (date, duration, height, mileage, num, speed) VALUES (NULL, NULL, NULL, NULL, NULL, NULL)",
    );
    const bytes = db.export();
    db.close();
    const parsed = parseMapDb(SQL, bytes);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].label).toBe("");
    expect(parsed.records[0].durationSeconds).toBe(0);
    expect(parsed.records[0].waypoints).toEqual([]);
  });
});

