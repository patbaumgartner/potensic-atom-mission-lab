// Conservative Atom mission validation.

import type { CinematicPlan } from "./cinematic";
import type { FormParams } from "./formBuilder";
import { haversineMeters } from "./geometry";
import { ATOM_LIMITS, type Mission, type ValidationIssue } from "./missionTypes";

/**
 * Validate a mission against conservative Atom constraints. Returns issues at
 * error/warning/info levels. Errors should block export; warnings should be
 * surfaced but not block an expert user.
 */
export function validateMission(mission: Mission): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const wps = mission.waypoints;

  if (!mission.name.trim()) {
    issues.push({
      level: "warning",
      code: "no-name",
      message: "Mission has no name; a default label will be used.",
    });
  }

  if (wps.length === 0) {
    issues.push({
      level: "error",
      code: "empty",
      message: "Mission has no waypoints.",
    });
    return issues;
  }

  if (wps.length === 1) {
    issues.push({
      level: "warning",
      code: "single-point",
      message: "Mission has a single waypoint; the drone will not travel a path.",
    });
  }

  const [latMin, latMax] = ATOM_LIMITS.latRange;
  const [lngMin, lngMax] = ATOM_LIMITS.lngRange;
  wps.forEach((wp, i) => {
    if (
      !Number.isFinite(wp.lat) ||
      !Number.isFinite(wp.lng) ||
      wp.lat < latMin ||
      wp.lat > latMax ||
      wp.lng < lngMin ||
      wp.lng > lngMax
    ) {
      issues.push({
        level: "error",
        code: "coord-range",
        message: `Waypoint ${i + 1} has out-of-range coordinates (${wp.lat}, ${wp.lng}).`,
      });
    }
  });

  for (let i = 1; i < wps.length; i++) {
    const d = haversineMeters(wps[i - 1], wps[i]);
    if (d < ATOM_LIMITS.minSpacingM) {
      issues.push({
        level: "warning",
        code: "too-close",
        message: `Waypoints ${i} and ${i + 1} are ${d.toFixed(2)} m apart (< ${ATOM_LIMITS.minSpacingM} m).`,
      });
    } else if (d > ATOM_LIMITS.maxSpacingM) {
      issues.push({
        level: "warning",
        code: "too-far",
        message: `Waypoints ${i} and ${i + 1} are ${d.toFixed(0)} m apart (> ${ATOM_LIMITS.maxSpacingM} m); path fidelity may drop.`,
      });
    }
  }

  if (wps.length > ATOM_LIMITS.maxWaypointsPerRecord) {
    issues.push({
      level: "info",
      code: "will-chunk",
      message: `Mission has ${wps.length} waypoints; it will be split into chunks of ${ATOM_LIMITS.maxWaypointsPerRecord}.`,
    });
  } else if (wps.length > ATOM_LIMITS.warnWaypointsPerRecord) {
    issues.push({
      level: "warning",
      code: "near-cap",
      message: `Mission has ${wps.length} waypoints; approaching the ${ATOM_LIMITS.maxWaypointsPerRecord}-waypoint practical cap.`,
    });
  }

  if (mission.plannedHeightM > 0) {
    issues.push({
      level: "info",
      code: "height-manual",
      message:
        "Atom does not honor per-waypoint height. Climb to the planned altitude manually before starting the mission.",
    });
  }

  return issues;
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}

export function validateCinematicPlan(
  params: FormParams,
  plan: CinematicPlan,
  availableLibrarySlots: number,
  plannedHeightM: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (params.buildingWidthM <= 0 || params.buildingDepthM <= 0) {
    issues.push({
      level: "error",
      code: "cinematic-footprint",
      message: "Building width and depth must both be greater than zero.",
    });
  }
  if (params.buildingClearanceM <= 0 || params.cinematicShotLengthM <= 0) {
    issues.push({
      level: "error",
      code: "cinematic-distances",
      message: "Safety clearance and filming distance must both be greater than zero.",
    });
  }
  if (params.cinematicLeadInM < 0) {
    issues.push({
      level: "error",
      code: "cinematic-lead-in",
      message: "Lead-in trim distance cannot be negative.",
    });
  }
  if (params.cinematicTargetHeightM >= plannedHeightM) {
    issues.push({
      level: "warning",
      code: "cinematic-gimbal-up",
      message:
        "The target is at or above camera altitude; fixed-gimbal framing may require upward tilt.",
    });
  }
  if (availableLibrarySlots < plan.shots.length) {
    issues.push({
      level: "error",
      code: "cinematic-library-capacity",
      message: `The library needs ${plan.shots.length} free slots to add the complete shot pack.`,
    });
  }
  if (plan.combinedRoute.length > ATOM_LIMITS.maxWaypointsPerMission) {
    issues.push({
      level: "error",
      code: "cinematic-route-cap",
      message: "The combined cinematic route exceeds the mission waypoint allocation limit.",
    });
  }
  if (
    plan.shots.some(
      (shot) => haversineMeters(params.center, shot.waypoints[1]) < plan.safetyRadiusM - 0.1,
    )
  ) {
    issues.push({
      level: "error",
      code: "cinematic-clearance",
      message: "A filming endpoint falls inside the configured building clearance envelope.",
    });
  }
  return issues;
}
