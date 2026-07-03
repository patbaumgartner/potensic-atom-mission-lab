// Conservative Atom mission validation.

import { haversineMeters } from "./geometry";
import {
  ATOM_LIMITS,
  type Mission,
  type ValidationIssue,
} from "./missionTypes";

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
