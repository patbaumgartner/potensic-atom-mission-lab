// Core mission model for first-generation Potensic Atom waypoint missions.

/** A single waypoint. Coordinates are WGS84 decimal degrees. */
export interface Waypoint {
  lat: number;
  lng: number;
}

/**
 * A planned mission.
 *
 * Atom constraint reminder: `plannedHeightM`, `plannedSpeedMs`, and gimbal are
 * NOT honored per-waypoint by the drone. They are stored as mission metadata and
 * surfaced in the field checklist only. The drone flies the 2D form; altitude is
 * set manually by climbing before starting the mission.
 */
export interface Mission {
  name: string;
  waypoints: Waypoint[];
  plannedHeightM: number;
  plannedSpeedMs: number;
}

/** One PotensicPro flight record (a chunk of a larger mission). */
export interface MissionChunk {
  /** Label written to flightrecordbean.date, e.g. "survey 001-045". */
  label: string;
  index: number;
  waypoints: Waypoint[];
}

type IssueLevel = "error" | "warning" | "info";

export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  message: string;
}

/** Conservative Atom operational limits. */
export const ATOM_LIMITS = {
  /** Practical hard cap of waypoints per flight record. */
  maxWaypointsPerRecord: 45,
  /** Warn when a single record approaches the cap. */
  warnWaypointsPerRecord: 40,
  /** Minimum sane spacing between consecutive waypoints (meters). */
  minSpacingM: 1,
  /** Warn above this spacing; very long legs reduce path fidelity (meters). */
  maxSpacingM: 500,
  latRange: [-90, 90] as const,
  lngRange: [-180, 180] as const,
} as const;
