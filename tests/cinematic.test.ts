import { describe, expect, it } from "vitest";
import {
  cinematicBuildingFootprint,
  cinematicSafetyRadius,
  cinematicViewDefinitions,
  combineCinematicShots,
  generateCinematicPlan,
  recommendFixedGimbal,
  type CinematicParams,
} from "../src/features/mission/cinematic";
import { bearingDeg, haversineMeters } from "../src/features/mission/geometry";
import { ATOM_LIMITS } from "../src/features/mission/missionTypes";

const CENTER = { lat: 47.4150833, lng: 9.3953087 };

const PARAMS: CinematicParams = {
  center: CENTER,
  frontBearingDeg: 0,
  viewCount: 8,
  buildingWidthM: 20,
  buildingDepthM: 15,
  clearanceM: 20,
  shotLengthM: 30,
  leadInM: 10,
  flightAltitudeM: 25,
  targetHeightM: 5,
};

describe("cinematic view geometry", () => {
  it("builds eight facade and corner views clockwise from the configured front", () => {
    const views = cinematicViewDefinitions(350, 8);
    expect(views.map((view) => view.label)).toEqual([
      "Front",
      "Front-right corner",
      "Right",
      "Rear-right corner",
      "Rear",
      "Rear-left corner",
      "Left",
      "Front-left corner",
    ]);
    expect(views.map((view) => view.subjectBearingDeg)).toEqual([
      350, 35, 80, 125, 170, 215, 260, 305,
    ]);
  });

  it("uses the four corner views in four-view mode", () => {
    expect(cinematicViewDefinitions(-10, 4)).toEqual([
      { label: "Front-right corner", subjectBearingDeg: 35 },
      { label: "Rear-right corner", subjectBearingDeg: 125 },
      { label: "Rear-left corner", subjectBearingDeg: 215 },
      { label: "Front-left corner", subjectBearingDeg: 305 },
    ]);
  });

  it("uses a circular clearance envelope around the complete footprint", () => {
    expect(cinematicSafetyRadius(PARAMS)).toBeCloseTo(32.5, 8);
    const footprint = cinematicBuildingFootprint(PARAMS);
    expect(footprint).toHaveLength(5);
    expect(footprint[4]).toEqual(footprint[0]);
    for (const corner of footprint.slice(0, -1)) {
      expect(haversineMeters(CENTER, corner)).toBeCloseTo(12.5, 1);
    }
  });
});

describe("cinematic shot plan", () => {
  it("creates smooth two-waypoint shots that fly directly toward the subject", () => {
    const plan = generateCinematicPlan(PARAMS);
    expect(plan.shots).toHaveLength(8);
    expect(plan.stagingDistanceM).toBeCloseTo(72.5, 8);
    expect(plan.filmingStartDistanceM).toBeCloseTo(62.5, 8);

    for (const shot of plan.shots) {
      expect(shot.waypoints).toHaveLength(2);
      expect(haversineMeters(CENTER, shot.waypoints[0])).toBeCloseTo(plan.stagingDistanceM, 1);
      expect(haversineMeters(CENTER, shot.waypoints[1])).toBeCloseTo(plan.safetyRadiusM, 1);
      expect(haversineMeters(CENTER, shot.filmingPath[0])).toBeCloseTo(
        plan.filmingStartDistanceM,
        1,
      );
      expect(bearingDeg(shot.waypoints[0], shot.waypoints[1])).toBeCloseTo(
        shot.flightBearingDeg,
        1,
      );
    }
  });

  it("keeps combined-route repositioning on or outside the safety envelope", () => {
    const plan = generateCinematicPlan(PARAMS);
    expect(plan.combinedRoute[0]).toEqual(plan.shots[0].waypoints[0]);
    expect(plan.combinedRoute[plan.combinedRoute.length - 1]).toEqual(
      plan.shots[plan.shots.length - 1].waypoints[0],
    );
    for (const waypoint of plan.combinedRoute) {
      expect(haversineMeters(CENTER, waypoint)).toBeGreaterThanOrEqual(plan.safetyRadiusM - 0.01);
    }
  });

  it("stays valid when the subject is near the antimeridian", () => {
    const plan = generateCinematicPlan({ ...PARAMS, center: { lat: 0, lng: 179.9999 } });
    for (const shot of plan.shots) {
      for (const waypoint of shot.waypoints) {
        expect(waypoint.lng).toBeGreaterThanOrEqual(-180);
        expect(waypoint.lng).toBeLessThan(180);
      }
    }
  });

  it("returns an empty combined route for an empty shot pack", () => {
    expect(combineCinematicShots(CENTER, [], 50)).toEqual([]);
  });

  it("caps an oversized combined route at the mission allocation ceiling", () => {
    const shot = generateCinematicPlan(PARAMS).shots[0];
    const manyShots = Array.from({ length: 1_000 }, (_, index) => ({
      ...shot,
      index,
      subjectBearingDeg: index % 360,
    }));
    expect(combineCinematicShots(CENTER, manyShots, 80)).toHaveLength(
      ATOM_LIMITS.maxWaypointsPerMission,
    );
  });
});

describe("fixed gimbal recommendation", () => {
  it("returns a downward pitch for a target below the camera", () => {
    const result = recommendFixedGimbal({
      flightAltitudeM: 25,
      targetHeightM: 5,
      filmingMidpointDistanceM: 40,
    });
    expect(result.pitchDeg).toBeCloseTo(-26.565, 3);
    expect(result.warning).toBeNull();
  });

  it("warns when framing would require upward tilt", () => {
    const result = recommendFixedGimbal({
      flightAltitudeM: 10,
      targetHeightM: 20,
      filmingMidpointDistanceM: 30,
    });
    expect(result.pitchDeg).toBeGreaterThan(0);
    expect(result.warning).toContain("upward gimbal tilt");
  });
});
