// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/unbound-method -- test mocking patterns */
import { describe, expect, it, vi } from "vitest";
import {
  buildChecklist,
  buildCinematicChecklist,
  downloadBytes,
  downloadText,
  exportProjectJSON,
  MAX_PROJECT_FILE_BYTES,
  waypointsToGeoJSON,
} from "../src/features/export";
import { generateCinematicPlan } from "../src/features/mission/cinematic";
import {
  DEFAULT_WORKSPACE,
  parseProject,
  WORKSPACE_VERSION,
} from "../src/features/mission/missionSchema";

describe("exportProjectJSON", () => {
  it("serialises library and workspace into valid JSON with an exportedAt timestamp", () => {
    const lib = [{ id: "1", name: "m" }];
    const ws = { v: 1, name: "Mission" };
    const serialized = exportProjectJSON({ library: lib, workspace: ws });
    const json = JSON.parse(serialized);
    expect(json.library).toEqual(lib);
    expect(json.workspace).toEqual(ws);
    expect(typeof json.exportedAt).toBe("string");
    expect(serialized).not.toContain("\n");
  });

  it("keeps a schema-maximum compact project below the import limit", () => {
    const waypoint = { lat: -89.99999999999999, lng: -179.99999999999997 };
    const waypoints = Array.from({ length: 2_000 }, () => waypoint);
    const library = Array.from({ length: 200 }, (_, index) => ({
      id: `${index}`.padEnd(200, "x"),
      name: "n".repeat(200),
      color: "#".repeat(200),
      waypoints,
      plannedHeightM: 10_000,
      plannedSpeedMs: 100,
    }));
    const workspace = { ...DEFAULT_WORKSPACE, v: WORKSPACE_VERSION };
    const serialized = exportProjectJSON({ library, workspace });
    expect(new Blob([serialized]).size).toBeLessThan(MAX_PROJECT_FILE_BYTES);
    expect(parseProject(JSON.parse(serialized))).not.toBeNull();
  });
});

describe("waypointsToGeoJSON", () => {
  it("produces a FeatureCollection with a LineString in lng/lat order", () => {
    const gj = JSON.parse(
      waypointsToGeoJSON("m", [
        { lat: 47.4, lng: 9.4 },
        { lat: 47.41, lng: 9.41 },
      ]),
    );
    expect(gj.type).toBe("FeatureCollection");
    expect(gj.features[0].geometry.type).toBe("LineString");
    expect(gj.features[0].geometry.coordinates[0]).toEqual([9.4, 47.4]);
    expect(
      gj.features.filter((f: { geometry: { type: string } }) => f.geometry.type === "Point"),
    ).toHaveLength(2);
  });
});

describe("downloads", () => {
  it("downloadBytes creates a blob URL, clicks an anchor, and revokes the URL", () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:bytes");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadBytes(new Uint8Array([1, 2, 3]), "test.db");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    vi.runAllTimers(); // run the deferred URL.revokeObjectURL cleanup
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:bytes");
    click.mockRestore();
    vi.useRealTimers();
  });

  it("downloadText creates a blob URL and clicks an anchor", () => {
    URL.createObjectURL = vi.fn(() => "blob:text");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadText("hello world", "a.txt");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});

describe("buildChecklist", () => {
  it("renders mission name, waypoint/chunk counts, distance, and planned height/speed", () => {
    const md = buildChecklist(
      { name: "Survey", waypoints: [{ lat: 0, lng: 0 }], plannedHeightM: 20, plannedSpeedMs: 5 },
      123,
      2,
    );
    expect(md).toContain("# Field checklist — Survey");
    expect(md).toContain("Waypoints: 1 (2 chunk(s))");
    expect(md).toContain("Path distance: 123 m");
    expect(md).toContain("Planned height: 20 m");
    expect(md).toContain("Planned speed: 5 m/s");
  });

  it("renders cinematic setup, views, and manual-control limitations", () => {
    const plan = generateCinematicPlan({
      center: { lat: 47.4, lng: 9.3 },
      frontBearingDeg: 0,
      pattern: "corners",
      buildingWidthM: 20,
      buildingDepthM: 15,
      clearanceM: 20,
      shotLengthM: 30,
      leadInM: 10,
      flightAltitudeM: 25,
      targetHeightM: 5,
    });
    const checklist = buildCinematicChecklist("House", plan, {
      mode: "route",
      plannedHeightM: 25,
      plannedSpeedMs: 3,
      leadInM: 10,
    });
    expect(checklist).toContain("4. Front-left corner");
    expect(checklist).toContain("Fixed gimbal pitch");
    expect(checklist).toContain("repositioning legs");
    expect(checklist).toContain("does not command the camera");
    expect(checklist).toContain("No yaw, gimbal, altitude, speed or recording command");

    const shotPack = buildCinematicChecklist("House", plan, {
      mode: "shots",
      plannedHeightM: 25,
      plannedSpeedMs: 3,
      leadInM: 10,
    });
    expect(shotPack).toContain("4 independent shots");
    expect(shotPack).not.toContain("Do not use outbound");
  });
});
