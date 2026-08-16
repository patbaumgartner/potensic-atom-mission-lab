import { describe, expect, it } from "vitest";
import { generateCinematicPlan } from "../src/features/mission/cinematic";
import { DEFAULT_FORM_PARAMS } from "../src/features/mission/formBuilder";
import { circleForm, destinationPoint } from "../src/features/mission/geometry";
import type { Mission, Waypoint } from "../src/features/mission/missionTypes";
import {
  hasBlockingErrors,
  validateCinematicPlan,
  validateMission,
} from "../src/features/mission/validator";

const ORIGIN: Waypoint = { lat: 47.415, lng: 9.395 };

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    name: "m",
    waypoints: circleForm(ORIGIN, 30, 8),
    plannedHeightM: 0,
    plannedSpeedMs: 5,
    ...overrides,
  };
}

describe("validateMission", () => {
  it("flags an empty mission as a blocking error", () => {
    const issues = validateMission(mission({ waypoints: [] }));
    expect(hasBlockingErrors(issues)).toBe(true);
    expect(issues.some((i) => i.code === "empty")).toBe(true);
  });

  it("flags out-of-range coordinates", () => {
    const issues = validateMission(mission({ waypoints: [{ lat: 200, lng: 0 }] }));
    expect(issues.some((i) => i.code === "coord-range")).toBe(true);
    expect(hasBlockingErrors(issues)).toBe(true);
  });

  it("passes a normal circle with no blocking errors", () => {
    expect(hasBlockingErrors(validateMission(mission()))).toBe(false);
  });

  it("warns on a single-point mission", () => {
    const issues = validateMission(mission({ waypoints: [ORIGIN] }));
    expect(issues.some((i) => i.code === "single-point")).toBe(true);
  });

  it("reports chunking info above the waypoint cap", () => {
    const wps = Array.from({ length: 60 }, (_, i) => destinationPoint(ORIGIN, i * 3, 20 + i));
    const issues = validateMission(mission({ waypoints: wps }));
    expect(issues.some((i) => i.code === "will-chunk")).toBe(true);
  });

  it("warns when points are too close together", () => {
    const a = ORIGIN;
    const b = destinationPoint(ORIGIN, 90, 0.2);
    const issues = validateMission(mission({ waypoints: [a, b] }));
    expect(issues.some((i) => i.code === "too-close")).toBe(true);
  });

  it("notes manual-altitude info when a height is set", () => {
    const issues = validateMission(mission({ plannedHeightM: 30 }));
    expect(issues.some((i) => i.code === "height-manual")).toBe(true);
  });

  it("warns when the mission has no name", () => {
    const issues = validateMission(mission({ name: "  " }));
    expect(issues.some((i) => i.code === "no-name")).toBe(true);
  });

  it("warns when consecutive points are too far apart", () => {
    const far = destinationPoint(ORIGIN, 90, 600);
    const issues = validateMission(mission({ waypoints: [ORIGIN, far] }));
    expect(issues.some((i) => i.code === "too-far")).toBe(true);
  });

  it("warns near the waypoint cap (41-45)", () => {
    const wps = circleForm(ORIGIN, 100, 42);
    const issues = validateMission(mission({ waypoints: wps }));
    expect(issues.some((i) => i.code === "near-cap")).toBe(true);
  });
});

describe("validateCinematicPlan", () => {
  const cinematicParams = { ...DEFAULT_FORM_PARAMS, center: ORIGIN };
  const plan = generateCinematicPlan({
    center: ORIGIN,
    frontBearingDeg: 0,
    pattern: "full",
    buildingWidthM: 20,
    buildingDepthM: 15,
    clearanceM: 20,
    shotLengthM: 30,
    leadInM: 10,
    flightAltitudeM: 25,
    targetHeightM: 5,
  });

  it("accepts a normal cinematic plan", () => {
    expect(validateCinematicPlan(cinematicParams, plan, 8, 25)).toEqual([]);
  });

  it("reports invalid geometry, framing, and library capacity", () => {
    const issues = validateCinematicPlan(
      {
        ...cinematicParams,
        buildingWidthM: 0,
        buildingDepthM: 0,
        buildingClearanceM: 0,
        cinematicShotLengthM: 0,
        cinematicLeadInM: -1,
        cinematicTargetHeightM: 25,
      },
      plan,
      0,
      25,
    );
    expect(issues.map((issue) => issue.code)).toEqual([
      "cinematic-footprint",
      "cinematic-distances",
      "cinematic-lead-in",
      "cinematic-gimbal-up",
      "cinematic-library-capacity",
    ]);

    const clipsCapacity = validateCinematicPlan(
      { ...cinematicParams, cinematicMode: "shots" },
      plan,
      0,
      25,
    );
    expect(
      clipsCapacity.find((issue) => issue.code === "cinematic-library-capacity")?.message,
    ).toBe("The library needs 8 free slots for this cinematic output.");
  });

  it("detects route allocation and endpoint clearance violations", () => {
    const invalidPlan: typeof plan = {
      ...plan,
      combinedRoute: Array.from({ length: 2_001 }, () => ORIGIN),
      shots: plan.shots.map((shot, index) =>
        index === 0 ? { ...shot, waypoints: [shot.waypoints[0], ORIGIN] } : shot,
      ),
    };
    const issues = validateCinematicPlan(cinematicParams, invalidPlan, 8, 25);
    expect(issues.some((issue) => issue.code === "cinematic-route-cap")).toBe(true);
    expect(issues.some((issue) => issue.code === "cinematic-clearance")).toBe(true);
  });
});
