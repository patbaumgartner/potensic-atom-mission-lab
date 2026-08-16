import { destinationPoint } from "./geometry";
import { ATOM_LIMITS, type Waypoint } from "./missionTypes";

export type CinematicMode = "shots" | "route";
export type CinematicViewCount = 4 | 8;

export interface CinematicParams {
  center: Waypoint;
  frontBearingDeg: number;
  viewCount: CinematicViewCount;
  buildingWidthM: number;
  buildingDepthM: number;
  clearanceM: number;
  shotLengthM: number;
  leadInM: number;
  flightAltitudeM: number;
  targetHeightM: number;
}

export interface CinematicShot {
  index: number;
  label: string;
  subjectBearingDeg: number;
  flightBearingDeg: number;
  waypoints: [Waypoint, Waypoint];
  filmingPath: [Waypoint, Waypoint];
}

export interface GimbalRecommendation {
  pitchDeg: number;
  warning: string | null;
}

export interface CinematicPlan {
  safetyRadiusM: number;
  filmingStartDistanceM: number;
  stagingDistanceM: number;
  footprint: Waypoint[];
  safetyEnvelope: Waypoint[];
  shots: CinematicShot[];
  combinedRoute: Waypoint[];
  gimbal: GimbalRecommendation;
}

const VIEW_LABELS_8 = [
  "Front",
  "Front-right corner",
  "Right",
  "Rear-right corner",
  "Rear",
  "Rear-left corner",
  "Left",
  "Front-left corner",
] as const;

const VIEW_LABELS_4 = [
  "Front-right corner",
  "Rear-right corner",
  "Rear-left corner",
  "Front-left corner",
] as const;

function normalizeBearing(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function circlePoints(center: Waypoint, radiusM: number, count = 64): Waypoint[] {
  const points = Array.from({ length: count }, (_, index) =>
    destinationPoint(center, (index * 360) / count, radiusM),
  );
  points.push(points[0]);
  return points;
}

export function cinematicSafetyRadius(params: {
  buildingWidthM: number;
  buildingDepthM: number;
  clearanceM: number;
}): number {
  return Math.hypot(params.buildingWidthM / 2, params.buildingDepthM / 2) + params.clearanceM;
}

export function cinematicViewDefinitions(
  frontBearingDeg: number,
  viewCount: CinematicViewCount,
): { label: string; subjectBearingDeg: number }[] {
  const labels = viewCount === 4 ? VIEW_LABELS_4 : VIEW_LABELS_8;
  const startOffset = viewCount === 4 ? 45 : 0;
  const step = 360 / viewCount;
  return labels.map((label, index) => ({
    label,
    subjectBearingDeg: normalizeBearing(frontBearingDeg + startOffset + index * step),
  }));
}

export function cinematicBuildingFootprint(params: {
  center: Waypoint;
  frontBearingDeg: number;
  buildingWidthM: number;
  buildingDepthM: number;
}): Waypoint[] {
  const halfWidth = params.buildingWidthM / 2;
  const halfDepth = params.buildingDepthM / 2;
  const front = destinationPoint(params.center, params.frontBearingDeg, halfDepth);
  const rear = destinationPoint(params.center, params.frontBearingDeg + 180, halfDepth);
  const frontRight = destinationPoint(front, params.frontBearingDeg + 90, halfWidth);
  const rearRight = destinationPoint(rear, params.frontBearingDeg + 90, halfWidth);
  const rearLeft = destinationPoint(rear, params.frontBearingDeg - 90, halfWidth);
  const frontLeft = destinationPoint(front, params.frontBearingDeg - 90, halfWidth);
  return [frontRight, rearRight, rearLeft, frontLeft, frontRight];
}

export function recommendFixedGimbal(params: {
  flightAltitudeM: number;
  targetHeightM: number;
  filmingMidpointDistanceM: number;
}): GimbalRecommendation {
  const verticalDropM = params.flightAltitudeM - params.targetHeightM;
  const pitchDeg = (-Math.atan2(verticalDropM, params.filmingMidpointDistanceM) * 180) / Math.PI;
  const warning =
    pitchDeg > 0
      ? "The target is above the planned camera altitude; this shot would require upward gimbal tilt."
      : null;
  return { pitchDeg, warning };
}

function outerTransition(
  center: Waypoint,
  radiusM: number,
  fromBearingDeg: number,
  toBearingDeg: number,
): Waypoint[] {
  const clockwiseSweep = normalizeBearing(toBearingDeg - fromBearingDeg);
  const steps = Math.max(1, Math.ceil(clockwiseSweep / 15));
  return Array.from({ length: steps }, (_, index) =>
    destinationPoint(center, fromBearingDeg + (clockwiseSweep * (index + 1)) / steps, radiusM),
  );
}

export function combineCinematicShots(
  center: Waypoint,
  shots: readonly CinematicShot[],
  stagingDistanceM: number,
): Waypoint[] {
  if (shots.length === 0) return [];
  const route: Waypoint[] = [];
  for (let index = 0; index < shots.length; index++) {
    const shot = shots[index];
    const [staging, inner] = shot.waypoints;
    if (index === 0) route.push(staging);
    route.push(inner, staging);
    const next = shots[index + 1];
    if (next) {
      route.push(
        ...outerTransition(
          center,
          stagingDistanceM,
          shot.subjectBearingDeg,
          next.subjectBearingDeg,
        ),
      );
    }
  }
  return route.slice(0, ATOM_LIMITS.maxWaypointsPerMission);
}

export function generateCinematicPlan(params: CinematicParams): CinematicPlan {
  const safetyRadiusM = cinematicSafetyRadius(params);
  const filmingStartDistanceM = safetyRadiusM + params.shotLengthM;
  const stagingDistanceM = filmingStartDistanceM + params.leadInM;
  const definitions = cinematicViewDefinitions(params.frontBearingDeg, params.viewCount);
  const shots = definitions.map<CinematicShot>((definition, index) => {
    const staging = destinationPoint(params.center, definition.subjectBearingDeg, stagingDistanceM);
    const filmingStart = destinationPoint(
      params.center,
      definition.subjectBearingDeg,
      filmingStartDistanceM,
    );
    const inner = destinationPoint(params.center, definition.subjectBearingDeg, safetyRadiusM);
    return {
      index,
      label: definition.label,
      subjectBearingDeg: definition.subjectBearingDeg,
      flightBearingDeg: normalizeBearing(definition.subjectBearingDeg + 180),
      waypoints: [staging, inner],
      filmingPath: [filmingStart, inner],
    };
  });
  return {
    safetyRadiusM,
    filmingStartDistanceM,
    stagingDistanceM,
    footprint: cinematicBuildingFootprint(params),
    safetyEnvelope: circlePoints(params.center, safetyRadiusM),
    shots,
    combinedRoute: combineCinematicShots(params.center, shots, stagingDistanceM),
    gimbal: recommendFixedGimbal({
      flightAltitudeM: params.flightAltitudeM,
      targetHeightM: params.targetHeightM,
      filmingMidpointDistanceM: safetyRadiusM + params.shotLengthM / 2,
    }),
  };
}
