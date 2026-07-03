import { describe, expect, it } from "vitest";
// Only the pure, non-React exports are tested here.
// useMissionLibrary (the React hook) is excluded from the coverage gate
// because it requires a live React + DOM test environment.

// Import the module dynamically to get its pure exports without triggering
// the React useEffect / useState imports under node environment.
import {
  isValidWaypoint,
  loadLibrary,
  uid,
  LIBRARY_KEY,
  PALETTE,
} from "../src/features/mission/useMissionLibrary";

describe("isValidWaypoint", () => {
  it("accepts an object with finite lat and lng", () => {
    expect(isValidWaypoint({ lat: 47.4, lng: 9.3 })).toBe(true);
  });
  it("rejects non-objects", () => {
    expect(isValidWaypoint(null)).toBe(false);
    expect(isValidWaypoint("string")).toBe(false);
    expect(isValidWaypoint(42)).toBe(false);
  });
  it("rejects NaN and Infinity lat/lng", () => {
    expect(isValidWaypoint({ lat: NaN, lng: 9.3 })).toBe(false);
    expect(isValidWaypoint({ lat: 47.4, lng: Infinity })).toBe(false);
  });
});

describe("uid", () => {
  it("returns a non-empty string", () => {
    expect(typeof uid()).toBe("string");
    expect(uid().length).toBeGreaterThan(0);
  });
  it("returns unique values", () => {
    expect(uid()).not.toBe(uid());
  });
});

describe("loadLibrary", () => {
  it("returns empty array when localStorage is empty", () => {
    expect(loadLibrary()).toEqual([]);
  });

  it("filters out invalid entries and returns valid ones", () => {
    const valid = {
      id: "a",
      name: "m",
      color: "#fff",
      waypoints: [{ lat: 47.4, lng: 9.3 }],
      plannedHeightM: 20,
      plannedSpeedMs: 5,
    };
    const invalid = { id: 1, name: null, color: "#f", waypoints: [] };
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => JSON.stringify([valid, invalid]),
    };
    const result = loadLibrary();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
    (globalThis as Record<string, unknown>).localStorage = undefined;
  });

  it("returns empty array on JSON parse error", () => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => "{{not-json",
    };
    expect(loadLibrary()).toEqual([]);
    (globalThis as Record<string, unknown>).localStorage = undefined;
  });
});

describe("constants", () => {
  it("LIBRARY_KEY is a non-empty string", () => {
    expect(typeof LIBRARY_KEY).toBe("string");
    expect(LIBRARY_KEY.length).toBeGreaterThan(0);
  });
  it("PALETTE contains at least 8 colour strings", () => {
    expect(Array.isArray(PALETTE)).toBe(true);
    expect(PALETTE.length).toBeGreaterThanOrEqual(8);
    PALETTE.forEach((c) => expect(c).toMatch(/^#/));
  });
});
