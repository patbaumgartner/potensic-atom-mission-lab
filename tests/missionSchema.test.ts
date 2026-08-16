import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FORM_PARAMS } from "../src/features/mission/formBuilder";
import {
  clearPersistedState,
  DEFAULT_WORKSPACE,
  LIBRARY_KEY,
  loadLibrary,
  loadLibraryState,
  loadWorkspace,
  loadWorkspaceState,
  PALETTE,
  parseFormParams,
  parseLibrary,
  parseProject,
  parseSavedMission,
  parseWaypoint,
  parseWaypoints,
  parseWorkspace,
  uid,
  WORKSPACE_KEY,
  WORKSPACE_VERSION,
} from "../src/features/mission/missionSchema";
import { ATOM_LIMITS } from "../src/features/mission/missionTypes";

const mission = (id = "a") => ({
  id,
  name: "Mission",
  color: "#fff",
  waypoints: [{ lat: 47.4, lng: 9.3 }],
  plannedHeightM: 20,
  plannedSpeedMs: 5,
});

afterEach(() => vi.unstubAllGlobals());

describe("parseWaypoint", () => {
  it("accepts finite coordinates and normalizes longitude", () => {
    const waypoint = parseWaypoint({ lat: 47.4, lng: 369.3 });
    expect(waypoint?.lat).toBe(47.4);
    expect(waypoint?.lng).toBeCloseTo(9.3);
  });

  it("rejects non-records and malformed coordinates", () => {
    expect(parseWaypoint(null)).toBeNull();
    expect(parseWaypoint("string")).toBeNull();
    expect(parseWaypoint(42)).toBeNull();
    expect(parseWaypoint([])).toBeNull();
    expect(parseWaypoint({ lat: "47.4", lng: 9.3 })).toBeNull();
    expect(parseWaypoint({ lat: NaN, lng: 9.3 })).toBeNull();
    expect(parseWaypoint({ lat: 47.4, lng: "9.3" })).toBeNull();
    expect(parseWaypoint({ lat: 47.4, lng: Infinity })).toBeNull();
    expect(parseWaypoint({ lat: -91, lng: 9.3 })).toBeNull();
    expect(parseWaypoint({ lat: 91, lng: 9.3 })).toBeNull();
  });
});

describe("parseWaypoints", () => {
  it("drops malformed points and rejects non-arrays", () => {
    expect(parseWaypoints(null)).toEqual([]);
    expect(parseWaypoints([{ lat: 1, lng: 2 }, null, { lat: 3, lng: 4 }])).toEqual([
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ]);
  });

  it("caps imported points at the mission allocation ceiling", () => {
    const points = Array.from({ length: ATOM_LIMITS.maxWaypointsPerMission + 1 }, () => ({
      lat: 1,
      lng: 2,
    }));
    expect(parseWaypoints(points)).toHaveLength(ATOM_LIMITS.maxWaypointsPerMission);
  });
});

describe("parseFormParams", () => {
  it("returns defaults for a non-record or unknown form", () => {
    expect(parseFormParams(null)).toBe(DEFAULT_FORM_PARAMS);
    expect(parseFormParams({ kind: "unknown" }).kind).toBe(DEFAULT_FORM_PARAMS.kind);
  });

  it("normalizes, clamps, rounds, and defaults every parameter type", () => {
    const parsed = parseFormParams({
      kind: "grid",
      center: { lat: 1, lng: 181 },
      radiusM: -1,
      headingDeg: -450,
      lengthM: 30_000,
      spacingM: undefined,
      sides: 4.6,
      innerRadiusM: Infinity,
      points: 500,
      widthM: -2,
      heightM: 30_000,
      passSpacingM: 0,
      startRadiusM: 9_000,
      turns: -2,
      manual: [{ lat: 1, lng: 2 }, null],
    });

    expect(parsed).toEqual({
      kind: "grid",
      center: { lat: 1, lng: -179 },
      radiusM: 0,
      headingDeg: 270,
      lengthM: 20_000,
      spacingM: DEFAULT_FORM_PARAMS.spacingM,
      sides: 5,
      innerRadiusM: DEFAULT_FORM_PARAMS.innerRadiusM,
      points: 200,
      widthM: 0,
      heightM: 20_000,
      passSpacingM: 0.5,
      startRadiusM: 5_000,
      turns: 0,
      manual: [{ lat: 1, lng: 2 }],
    });
  });
});

describe("library parsing", () => {
  it("rejects malformed missions", () => {
    expect(parseSavedMission(null)).toBeNull();
    expect(parseSavedMission({ id: "", color: "#fff", waypoints: [] })).toBeNull();
    expect(parseSavedMission({ id: 1, color: "#fff", waypoints: [] })).toBeNull();
    expect(parseSavedMission({ ...mission(), name: 1 })).toBeNull();
    expect(parseSavedMission({ ...mission(), color: 1 })).toBeNull();
    expect(parseSavedMission({ ...mission(), waypoints: null })).toBeNull();
    expect(parseSavedMission({ ...mission(), plannedHeightM: NaN })).toBeNull();
    expect(parseSavedMission({ ...mission(), plannedSpeedMs: Infinity })).toBeNull();
    expect(parseSavedMission({ ...mission(), waypoints: [{ lat: 1, lng: 2 }, null] })).toBeNull();
    expect(
      parseSavedMission({
        ...mission(),
        waypoints: Array.from({ length: ATOM_LIMITS.maxWaypointsPerMission + 1 }, () => ({
          lat: 1,
          lng: 2,
        })),
      }),
    ).toBeNull();
  });

  it("rejects mission values that would require transformation", () => {
    expect(parseSavedMission({ ...mission(), id: "x".repeat(201) })).toBeNull();
    expect(parseSavedMission({ ...mission(), name: "x".repeat(201) })).toBeNull();
    expect(parseSavedMission({ ...mission(), color: "#".repeat(201) })).toBeNull();
    expect(parseSavedMission({ ...mission(), plannedHeightM: -1 })).toBeNull();
    expect(parseSavedMission({ ...mission(), plannedHeightM: 10_001 })).toBeNull();
    expect(parseSavedMission({ ...mission(), plannedSpeedMs: -1 })).toBeNull();
    expect(parseSavedMission({ ...mission(), plannedSpeedMs: 101 })).toBeNull();
    expect(parseSavedMission({ ...mission(), waypoints: [{ lat: 47.4, lng: 540 }] })).toBeNull();
    expect(parseSavedMission(mission())).toEqual(mission());
  });

  it("rejects the whole library when an entry is malformed or duplicated", () => {
    expect(parseLibrary(null)).toEqual([]);
    expect(parseLibrary([mission(), mission(), null])).toEqual([]);
  });

  it("rejects libraries above the allocation ceiling", () => {
    const entries = Array.from({ length: ATOM_LIMITS.maxLibraryEntries + 1 }, (_, index) =>
      mission(String(index)),
    );
    expect(parseLibrary(entries)).toEqual([]);
  });
});

describe("workspace and project parsing", () => {
  it("requires the current workspace version", () => {
    expect(parseWorkspace(null)).toBe(DEFAULT_WORKSPACE);
    expect(parseWorkspace({ v: WORKSPACE_VERSION + 1 })).toBe(DEFAULT_WORKSPACE);
  });

  it("sanitizes workspace values", () => {
    const parsed = parseWorkspace({
      v: WORKSPACE_VERSION,
      params: { kind: "manual" },
      name: 12,
      heightM: -1,
      speedMs: 200,
      chunkSize: 100,
      batteryMin: 0,
      reservePct: 100,
      geofenceM: 0,
      editingId: 12,
    });
    expect(parsed.name).toBe(DEFAULT_WORKSPACE.name);
    expect(parsed.params.kind).toBe("manual");
    expect(parsed.heightM).toBe(0);
    expect(parsed.speedMs).toBe(100);
    expect(parsed.chunkSize).toBe(ATOM_LIMITS.maxWaypointsPerRecord);
    expect(parsed.batteryMin).toBe(1);
    expect(parsed.reservePct).toBe(95);
    expect(parsed.geofenceM).toBe(1);
    expect(parsed.editingId).toBeNull();
  });

  it("preserves edit linkage only when workspace recovery is lossless", () => {
    expect(
      parseWorkspace({ ...DEFAULT_WORKSPACE, v: WORKSPACE_VERSION, editingId: "a" }).editingId,
    ).toBe("a");
    expect(
      parseWorkspace({
        ...DEFAULT_WORKSPACE,
        v: WORKSPACE_VERSION,
        params: { ...DEFAULT_FORM_PARAMS, radiusM: Infinity },
        editingId: "a",
      }).editingId,
    ).toBeNull();
    expect(
      parseWorkspace({
        ...DEFAULT_WORKSPACE,
        v: WORKSPACE_VERSION,
        params: { ...DEFAULT_FORM_PARAMS, center: null },
        editingId: "a",
      }).editingId,
    ).toBeNull();
  });

  it("rejects unrecognizable projects", () => {
    expect(parseProject(null)).toBeNull();
    expect(parseProject({})).toBeNull();
  });

  it("rejects partial projects", () => {
    expect(parseProject({ library: [mission()] })).toBeNull();
    expect(parseProject({ workspace: { v: WORKSPACE_VERSION } })).toBeNull();
  });

  it("preserves an editing id that resolves in the imported library", () => {
    const parsed = parseProject({
      library: [mission()],
      workspace: { ...DEFAULT_WORKSPACE, v: WORKSPACE_VERSION, editingId: "a" },
    });
    expect(parsed?.workspace.editingId).toBe("a");
  });

  it("rejects a dangling editing id", () => {
    expect(
      parseProject({
        library: [mission()],
        workspace: { ...DEFAULT_WORKSPACE, v: WORKSPACE_VERSION, editingId: "missing" },
      }),
    ).toBeNull();
  });

  it("rejects projects whose accepted values would be transformed", () => {
    expect(
      parseProject({
        library: [{ ...mission(), name: "x".repeat(201) }],
        workspace: { ...DEFAULT_WORKSPACE, v: WORKSPACE_VERSION },
      }),
    ).toBeNull();
    expect(
      parseProject({
        library: [mission()],
        workspace: { ...DEFAULT_WORKSPACE, v: WORKSPACE_VERSION, heightM: 10_001 },
      }),
    ).toBeNull();
  });
});

describe("persistence", () => {
  it("loads saved library and workspace values", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === LIBRARY_KEY
          ? JSON.stringify([mission()])
          : JSON.stringify({ v: WORKSPACE_VERSION, name: "Saved" }),
    });
    expect(loadLibrary()).toEqual([expect.objectContaining({ id: "a" })]);
    expect(loadWorkspace().name).toBe("Saved");
  });

  it("uses defaults for missing or unreadable storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    expect(loadLibrary()).toEqual([]);
    expect(loadWorkspace()).toBe(DEFAULT_WORKSPACE);

    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage unavailable");
      },
    });
    expect(loadLibrary()).toEqual([]);
    expect(loadWorkspace()).toBe(DEFAULT_WORKSPACE);
  });

  it("write-locks a stored library with valid JSON but invalid structure", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ library: [] }) });
    expect(loadLibraryState()).toEqual({ library: [], persistenceBlocked: true });
  });

  it("write-locks lossy workspace recovery", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ v: WORKSPACE_VERSION, name: "Partial" }),
    });
    expect(loadWorkspaceState()).toEqual({
      workspace: { ...DEFAULT_WORKSPACE, name: "Partial" },
      persistenceBlocked: true,
    });
  });

  it("loads a complete workspace without a write lock", () => {
    const workspace = { ...DEFAULT_WORKSPACE, v: WORKSPACE_VERSION };
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(workspace) });
    expect(loadWorkspaceState()).toEqual({
      workspace: DEFAULT_WORKSPACE,
      persistenceBlocked: false,
    });
  });

  it("clears both persisted keys and tolerates storage failures", () => {
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", { removeItem });
    clearPersistedState();
    expect(removeItem).toHaveBeenCalledWith(WORKSPACE_KEY);
    expect(removeItem).toHaveBeenCalledWith(LIBRARY_KEY);

    vi.stubGlobal("localStorage", {
      removeItem: () => {
        throw new Error("storage unavailable");
      },
    });
    expect(() => clearPersistedState()).not.toThrow();
  });
});

describe("uid and constants", () => {
  it("uses randomUUID when available and has a fallback", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "generated-id" });
    expect(uid()).toBe("generated-id");

    vi.stubGlobal("crypto", {});
    expect(uid()).toMatch(/^\d+-[a-z0-9]+$/);
  });

  it("exports stable storage keys and a color palette", () => {
    expect(LIBRARY_KEY).not.toBe(WORKSPACE_KEY);
    expect(LIBRARY_KEY.length).toBeGreaterThan(0);
    expect(PALETTE.length).toBeGreaterThanOrEqual(8);
    PALETTE.forEach((color) => expect(color).toMatch(/^#/));
  });
});
