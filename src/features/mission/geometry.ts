// Geodesic helpers and flight-form generators for Atom missions.
//
// All distances are meters, bearings are degrees clockwise from north, and
// coordinates are WGS84 decimal degrees. We use spherical-earth math which is
// accurate to well under a meter over the small areas a mission covers.

import type { MissionChunk, Waypoint } from "./missionTypes";

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Great-circle distance between two points in meters. */
export function haversineMeters(a: Waypoint, b: Waypoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b`, degrees clockwise from north (0..360). */
export function bearingDeg(a: Waypoint, b: Waypoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached by travelling `distanceM` from `origin` along `bearing`. */
export function destinationPoint(origin: Waypoint, bearing: number, distanceM: number): Waypoint {
  const angular = distanceM / EARTH_RADIUS_M;
  const brng = toRad(bearing);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}

/** Total length of a polyline path in meters. */
export function pathLengthMeters(points: Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/** Estimated flight duration for a path at a constant ground speed. */
export function estimateDurationSeconds(points: Waypoint[], speedMs: number): number {
  if (speedMs <= 0) return 0;
  return pathLengthMeters(points) / speedMs;
}

/**
 * Resample a polyline so consecutive samples are ~`spacingM` apart.
 * Endpoints are always preserved. Useful to convert a sparse hand-drawn path
 * into an evenly spaced waypoint list.
 */
export function resamplePath(points: Waypoint[], spacingM: number): Waypoint[] {
  if (points.length < 2 || spacingM <= 0) return [...points];
  const out: Waypoint[] = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segLen = haversineMeters(a, b);
    if (segLen === 0) continue;
    const brng = bearingDeg(a, b);
    let distFromA = spacingM - carry;
    while (distFromA < segLen) {
      out.push(destinationPoint(a, brng, distFromA));
      distFromA += spacingM;
    }
    carry = segLen - (distFromA - spacingM);
  }
  const last = points[points.length - 1];
  if (haversineMeters(out[out.length - 1], last) > spacingM * 0.25) {
    out.push(last);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flight forms
// ---------------------------------------------------------------------------

/** Straight line from `start` to `end`, sampled every `spacingM`. */
export function lineForm(start: Waypoint, end: Waypoint, spacingM: number): Waypoint[] {
  return resamplePath([start, end], spacingM);
}

/** Regular polygon around `center`. `sides` >= 3. Closed (returns to start). */
export function polygonForm(
  center: Waypoint,
  radiusM: number,
  sides: number,
  rotationDeg = 0,
): Waypoint[] {
  const n = Math.max(3, Math.round(sides));
  const pts: Waypoint[] = [];
  for (let i = 0; i < n; i++) {
    const angle = rotationDeg + (360 / n) * i;
    pts.push(destinationPoint(center, angle, radiusM));
  }
  pts.push(pts[0]);
  return pts;
}

/** Circle approximated by `points` evenly spaced vertices. */
export function circleForm(
  center: Waypoint,
  radiusM: number,
  points: number,
  rotationDeg = 0,
): Waypoint[] {
  const n = Math.max(3, Math.round(points));
  const pts: Waypoint[] = [];
  for (let i = 0; i < n; i++) {
    pts.push(destinationPoint(center, rotationDeg + (360 / n) * i, radiusM));
  }
  pts.push(pts[0]);
  return pts;
}

/**
 * Lawnmower / boustrophedon survey grid centered on `center`.
 * `headingDeg` is the direction of the long passes. `passSpacingM` is the
 * lateral distance between passes; `sampleSpacingM` samples along each pass.
 */
export function gridForm(params: {
  center: Waypoint;
  widthM: number;
  heightM: number;
  passSpacingM: number;
  sampleSpacingM: number;
  headingDeg?: number;
}): Waypoint[] {
  const { center, widthM, heightM, passSpacingM, sampleSpacingM } = params;
  const heading = params.headingDeg ?? 0;
  const across = heading + 90;
  const passes = Math.max(1, Math.floor(widthM / Math.max(1, passSpacingM)) + 1);
  // Start at the bottom-left corner of the rectangle.
  const halfLeft = destinationPoint(center, across + 180, widthM / 2);
  const corner = destinationPoint(halfLeft, heading + 180, heightM / 2);
  const out: Waypoint[] = [];
  for (let p = 0; p < passes; p++) {
    const base = destinationPoint(corner, across, p * passSpacingM);
    const start = base;
    const end = destinationPoint(base, heading, heightM);
    const leg = p % 2 === 0 ? [start, end] : [end, start];
    for (const wp of resamplePath(leg, sampleSpacingM)) out.push(wp);
  }
  return out;
}

/** Archimedean spiral from `startRadiusM` out to `endRadiusM`. */
export function spiralForm(params: {
  center: Waypoint;
  startRadiusM: number;
  endRadiusM: number;
  turns: number;
  pointsPerTurn: number;
  rotationDeg?: number;
}): Waypoint[] {
  const { center, startRadiusM, endRadiusM, turns, pointsPerTurn } = params;
  const rotation = params.rotationDeg ?? 0;
  const totalPoints = Math.max(2, Math.round(turns * pointsPerTurn));
  const out: Waypoint[] = [];
  for (let i = 0; i <= totalPoints; i++) {
    const t = i / totalPoints;
    const radius = startRadiusM + (endRadiusM - startRadiusM) * t;
    const angle = rotation + 360 * turns * t;
    out.push(destinationPoint(center, angle, radius));
  }
  return out;
}

/** Star polygon with `points` outer vertices. */
export function starForm(params: {
  center: Waypoint;
  outerRadiusM: number;
  innerRadiusM: number;
  points: number;
  rotationDeg?: number;
}): Waypoint[] {
  const { center, outerRadiusM, innerRadiusM } = params;
  const n = Math.max(3, Math.round(params.points));
  const rotation = params.rotationDeg ?? 0;
  const out: Waypoint[] = [];
  for (let i = 0; i < n * 2; i++) {
    const radius = i % 2 === 0 ? outerRadiusM : innerRadiusM;
    const angle = rotation + (360 / (n * 2)) * i;
    out.push(destinationPoint(center, angle, radius));
  }
  out.push(out[0]);
  return out;
}

/**
 * Split a waypoint list into chunks of at most `size`, producing PotensicPro
 * flight records. Labels are zero-padded 1-based ranges, e.g. "name 001-045".
 */
export function chunkWaypoints(name: string, waypoints: Waypoint[], size: number): MissionChunk[] {
  const cap = Math.max(1, Math.min(size, 45));
  const chunks: MissionChunk[] = [];
  for (let i = 0; i < waypoints.length; i += cap) {
    const slice = waypoints.slice(i, i + cap);
    const from = i + 1;
    const to = i + slice.length;
    const label =
      waypoints.length <= cap
        ? name
        : `${name} ${String(from).padStart(3, "0")}-${String(to).padStart(3, "0")}`;
    chunks.push({ label, index: chunks.length, waypoints: slice });
  }
  return chunks;
}

/** Max distance from a home point to any waypoint (meters). */
export function maxDistanceMeters(home: Waypoint, points: Waypoint[]): number {
  let max = 0;
  for (const p of points) max = Math.max(max, haversineMeters(home, p));
  return max;
}

function toLocalXY(p: Waypoint, ref: Waypoint): { x: number; y: number } {
  const k = Math.cos(toRad(ref.lat));
  return {
    x: toRad(p.lng - ref.lng) * EARTH_RADIUS_M * k,
    y: toRad(p.lat - ref.lat) * EARTH_RADIUS_M,
  };
}

/** Shortest distance (m) from point p to segment a-b, via local planar projection. */
function pointSegmentMeters(p: Waypoint, a: Waypoint, b: Waypoint): number {
  const P = toLocalXY(p, a);
  const B = toLocalXY(b, a);
  const len2 = B.x * B.x + B.y * B.y;
  let t = len2 > 0 ? (P.x * B.x + P.y * B.y) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(P.x - B.x * t, P.y - B.y * t);
}

export interface DeviationStats {
  maxM: number;
  avgM: number;
}

/** Deviation of an actual track from a planned polyline (nearest-point). */
export function pathDeviation(actual: Waypoint[], planned: Waypoint[]): DeviationStats {
  if (actual.length === 0 || planned.length < 2) return { maxM: 0, avgM: 0 };
  let max = 0;
  let sum = 0;
  for (const p of actual) {
    let best = Infinity;
    for (let i = 1; i < planned.length; i++) {
      best = Math.min(best, pointSegmentMeters(p, planned[i - 1], planned[i]));
    }
    max = Math.max(max, best);
    sum += best;
  }
  return { maxM: max, avgM: sum / actual.length };
}

/** Reflect points horizontally (mirror longitude) about a center. */
export function mirrorPoints(points: Waypoint[], center: Waypoint): Waypoint[] {
  return points.map((p) => ({ lat: p.lat, lng: 2 * center.lng - p.lng }));
}

/** Ensure a closed loop by appending the first point if needed. */
export function closeLoop(points: Waypoint[]): Waypoint[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (haversineMeters(first, last) < 0.5) return points;
  return [...points, { ...first }];
}
