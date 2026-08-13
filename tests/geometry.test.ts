import { describe, expect, it } from "vitest";
import {
  bearingDeg,
  chunkWaypoints,
  circleForm,
  closeLoop,
  destinationPoint,
  estimateDurationSeconds,
  gridForm,
  haversineMeters,
  lineForm,
  maxDistanceMeters,
  mirrorPoints,
  normalizeLongitude,
  pathDeviation,
  pathLengthMeters,
  polygonForm,
  resamplePath,
  spiralForm,
  starForm,
} from "../src/features/mission/geometry";
import { ATOM_LIMITS, type Waypoint } from "../src/features/mission/missionTypes";

const ORIGIN: Waypoint = { lat: 47.4150833, lng: 9.3953087 };

describe("geodesic helpers", () => {
  it("computes distance ~0 for identical points", () => {
    expect(haversineMeters(ORIGIN, ORIGIN)).toBeCloseTo(0, 6);
  });

  it("destination + haversine round-trip preserves distance", () => {
    const p = destinationPoint(ORIGIN, 90, 100);
    expect(haversineMeters(ORIGIN, p)).toBeCloseTo(100, 1);
  });

  it("bearing east is ~90 degrees", () => {
    const p = destinationPoint(ORIGIN, 90, 50);
    expect(bearingDeg(ORIGIN, p)).toBeCloseTo(90, 1);
  });
});

describe("resamplePath", () => {
  it("produces evenly spaced points along a line", () => {
    const end = destinationPoint(ORIGIN, 0, 100);
    const pts = resamplePath([ORIGIN, end], 10);
    expect(pts.length).toBeGreaterThanOrEqual(11);
    for (let i = 1; i < pts.length - 1; i++) {
      expect(haversineMeters(pts[i - 1], pts[i])).toBeCloseTo(10, 0);
    }
  });
});

describe("flight forms", () => {
  it("line form spans the requested length", () => {
    const end = destinationPoint(ORIGIN, 45, 200);
    const pts = lineForm(ORIGIN, end, 25);
    expect(pathLengthMeters(pts)).toBeCloseTo(200, 0);
  });

  it("polygon form is closed and has sides+1 vertices", () => {
    const pts = polygonForm(ORIGIN, 50, 5);
    expect(pts.length).toBe(6);
    expect(pts[0].lat).toBeCloseTo(pts[pts.length - 1].lat, 9);
    expect(pts[0].lng).toBeCloseTo(pts[pts.length - 1].lng, 9);
  });

  it("circle form vertices sit on the radius", () => {
    const pts = circleForm(ORIGIN, 40, 12);
    for (const p of pts) {
      expect(haversineMeters(ORIGIN, p)).toBeCloseTo(40, 0);
    }
  });

  it("grid form covers multiple passes", () => {
    const pts = gridForm({
      center: ORIGIN,
      widthM: 40,
      heightM: 60,
      passSpacingM: 10,
      sampleSpacingM: 15,
    });
    expect(pts.length).toBeGreaterThan(10);
  });
});

/** East-west and north-south extent of a heading-0 grid, in meters. */
function gridExtent(pts: Waypoint[]): { acrossM: number; alongM: number } {
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const lat = ORIGIN.lat;
  return {
    acrossM: haversineMeters({ lat, lng: Math.min(...lngs) }, { lat, lng: Math.max(...lngs) }),
    alongM: haversineMeters(
      { lat: Math.min(...lats), lng: ORIGIN.lng },
      { lat: Math.max(...lats), lng: ORIGIN.lng },
    ),
  };
}

describe("gridForm coverage", () => {
  it.each([
    [60, 12],
    [60, 7],
    [100, 30],
    [55, 8],
    [17, 40],
  ])("spans the full %i m width at %i m requested spacing", (widthM, passSpacingM) => {
    const pts = gridForm({ center: ORIGIN, widthM, heightM: 40, passSpacingM, sampleSpacingM: 20 });
    const { acrossM, alongM } = gridExtent(pts);
    expect(acrossM).toBeCloseTo(widthM, 0);
    expect(alongM).toBeCloseTo(40, 0);
  });

  it("never leaves a lateral gap wider than the requested pass spacing", () => {
    const passSpacingM = 7;
    const pts = gridForm({
      center: ORIGIN,
      widthM: 60,
      heightM: 40,
      passSpacingM,
      sampleSpacingM: 20,
    });
    const lngs = [...new Set(pts.map((p) => p.lng))].sort((a, b) => a - b);
    for (let i = 1; i < lngs.length; i++) {
      const gap = haversineMeters(
        { lat: ORIGIN.lat, lng: lngs[i - 1] },
        { lat: ORIGIN.lat, lng: lngs[i] },
      );
      expect(gap).toBeLessThanOrEqual(passSpacingM + 1e-6);
    }
  });

  it("collapses to a single pass instead of stacking points when spacing is not positive", () => {
    for (const passSpacingM of [0, -5, NaN]) {
      const pts = gridForm({
        center: ORIGIN,
        widthM: 60,
        heightM: 80,
        passSpacingM,
        sampleSpacingM: 20,
      });
      expect(gridExtent(pts).acrossM).toBeCloseTo(0, 3);
      expect(gridExtent(pts).alongM).toBeCloseTo(80, 0);
      expect(pts.length).toBeLessThan(10);
    }
  });

  it("degrades to a single point for a zero-area footprint", () => {
    const pts = gridForm({
      center: ORIGIN,
      widthM: 0,
      heightM: 0,
      passSpacingM: 10,
      sampleSpacingM: 10,
    });
    expect(pts).toHaveLength(1);
  });
});

describe("resamplePath endpoint contract", () => {
  it("always reaches the requested endpoint exactly", () => {
    for (const lengthM of [92, 95, 100, 101, 137]) {
      const end = destinationPoint(ORIGIN, 30, lengthM);
      const pts = resamplePath([ORIGIN, end], 10);
      expect(haversineMeters(pts[pts.length - 1], end)).toBeCloseTo(0, 6);
      expect(pathLengthMeters(pts)).toBeCloseTo(lengthM, 0);
    }
  });

  it("snaps the final sample instead of emitting a sub-metre leg", () => {
    const end = destinationPoint(ORIGIN, 0, 90.4);
    const pts = resamplePath([ORIGIN, end], 10);
    const finalLeg = haversineMeters(pts[pts.length - 2], pts[pts.length - 1]);
    expect(finalLeg).toBeGreaterThanOrEqual(ATOM_LIMITS.minSpacingM);
    expect(haversineMeters(pts[pts.length - 1], end)).toBeCloseTo(0, 6);
  });

  it("keeps a path shorter than the minimum leg as its two endpoints", () => {
    const end = destinationPoint(ORIGIN, 0, 0.4);
    expect(resamplePath([ORIGIN, end], 10)).toHaveLength(2);
  });

  it("returns a copy unchanged for a non-positive spacing", () => {
    const end = destinationPoint(ORIGIN, 0, 50);
    for (const spacing of [0, -1, NaN]) {
      expect(resamplePath([ORIGIN, end], spacing)).toEqual([ORIGIN, end]);
    }
  });
});

describe("more forms & measures", () => {
  it("starForm has 2*points+1 vertices and outer vertices on the outer radius", () => {
    const pts = starForm({
      center: ORIGIN,
      outerRadiusM: 50,
      innerRadiusM: 20,
      points: 5,
    });
    expect(pts.length).toBe(11);
    for (let i = 0; i < pts.length - 1; i += 2) {
      expect(haversineMeters(ORIGIN, pts[i])).toBeCloseTo(50, 0);
    }
  });

  it("spiralForm grows from start to end radius", () => {
    const pts = spiralForm({
      center: ORIGIN,
      startRadiusM: 5,
      endRadiusM: 40,
      turns: 2,
      pointsPerTurn: 12,
    });
    expect(pts.length).toBe(25);
    expect(haversineMeters(ORIGIN, pts[0])).toBeCloseTo(5, 0);
    expect(haversineMeters(ORIGIN, pts[pts.length - 1])).toBeCloseTo(40, 0);
  });

  it("estimateDurationSeconds divides length by speed and guards zero", () => {
    const line = lineForm(ORIGIN, destinationPoint(ORIGIN, 90, 100), 10);
    expect(estimateDurationSeconds(line, 5)).toBeCloseTo(20, 1);
    expect(estimateDurationSeconds(line, 0)).toBe(0);
  });

  it("resamplePath returns a copy for short paths and preserves the last point", () => {
    expect(resamplePath([ORIGIN], 10)).toEqual([ORIGIN]);
    const end = destinationPoint(ORIGIN, 0, 95);
    const pts = resamplePath([ORIGIN, end], 10);
    const last = pts[pts.length - 1];
    expect(haversineMeters(last, end)).toBeLessThan(10);
  });

  it("pathLengthMeters is 0 for a single point", () => {
    expect(pathLengthMeters([ORIGIN])).toBe(0);
  });

  it("resamplePath skips zero-length segments", () => {
    const pts = resamplePath([ORIGIN, ORIGIN, destinationPoint(ORIGIN, 0, 50)], 10);
    expect(pts.length).toBeGreaterThan(1);
  });

  it("pathDeviation handles a degenerate (zero-length) planned segment", () => {
    const planned = [ORIGIN, ORIGIN, destinationPoint(ORIGIN, 90, 50)];
    const dev = pathDeviation([destinationPoint(ORIGIN, 90, 25)], planned);
    expect(dev.maxM).toBeGreaterThanOrEqual(0);
  });

  it("closeLoop leaves an already-closed or tiny path unchanged", () => {
    expect(closeLoop([ORIGIN, ORIGIN])).toHaveLength(2);
    const closed = circleForm(ORIGIN, 20, 5);
    expect(closeLoop(closed)).toBe(closed);
  });

  it("maxDistanceMeters and pathDeviation handle empty input", () => {
    expect(maxDistanceMeters(ORIGIN, [])).toBe(0);
    expect(pathDeviation([], [ORIGIN, destinationPoint(ORIGIN, 0, 10)])).toEqual({
      maxM: 0,
      avgM: 0,
    });
  });
});

describe("safety & analysis helpers", () => {
  it("maxDistanceMeters finds the farthest waypoint", () => {
    const pts = [
      destinationPoint(ORIGIN, 0, 20),
      destinationPoint(ORIGIN, 90, 55),
      destinationPoint(ORIGIN, 180, 10),
    ];
    expect(maxDistanceMeters(ORIGIN, pts)).toBeCloseTo(55, 0);
  });

  it("mirrorPoints reflects longitude about the center", () => {
    const p = { lat: 47.42, lng: 9.4 };
    const [m] = mirrorPoints([p], ORIGIN);
    expect(m.lat).toBeCloseTo(p.lat, 9);
    expect(m.lng).toBeCloseTo(2 * ORIGIN.lng - p.lng, 9);
  });

  it("closeLoop appends the first point when open", () => {
    const open = polygonForm(ORIGIN, 30, 4).slice(0, 4);
    const closed = closeLoop(open);
    expect(closed).toHaveLength(open.length + 1);
    expect(closed[closed.length - 1]).toEqual(closed[0]);
  });

  it("pathDeviation is ~0 when actual lies on the planned line", () => {
    const planned = lineForm(ORIGIN, destinationPoint(ORIGIN, 90, 100), 10);
    const onLine = [destinationPoint(ORIGIN, 90, 25), destinationPoint(ORIGIN, 90, 60)];
    const dev = pathDeviation(onLine, planned);
    expect(dev.maxM).toBeLessThan(0.5);
    expect(dev.avgM).toBeLessThan(0.5);
  });

  it("pathDeviation measures offset from the planned line", () => {
    const planned = lineForm(ORIGIN, destinationPoint(ORIGIN, 90, 100), 10);
    const off = destinationPoint(destinationPoint(ORIGIN, 90, 50), 0, 8);
    const dev = pathDeviation([off], planned);
    expect(dev.maxM).toBeCloseTo(8, 0);
  });
});

describe("chunkWaypoints", () => {
  it("keeps a small mission as a single unlabeled chunk", () => {
    const wps = circleForm(ORIGIN, 20, 6);
    const chunks = chunkWaypoints("loop", wps, 45);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].label).toBe("loop");
  });

  it("splits a large mission into zero-padded labeled ranges", () => {
    const wps = Array.from({ length: 100 }, (_, i) => destinationPoint(ORIGIN, i, 10 + i));
    const chunks = chunkWaypoints("survey", wps, 45);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].label).toBe("survey 001-045");
    expect(chunks[1].label).toBe("survey 046-090");
    expect(chunks[2].label).toBe("survey 091-100");
    expect(chunks.reduce((n, c) => n + c.waypoints.length, 0)).toBe(100);
  });

  it("never exceeds the Atom per-record cap, whatever size is requested", () => {
    const wps = Array.from({ length: 100 }, (_, i) => destinationPoint(ORIGIN, i, 10 + i));
    for (const size of [999, Infinity, ATOM_LIMITS.maxWaypointsPerRecord + 1]) {
      const chunks = chunkWaypoints("m", wps, size);
      for (const c of chunks) {
        expect(c.waypoints.length).toBeLessThanOrEqual(ATOM_LIMITS.maxWaypointsPerRecord);
      }
      expect(chunks.reduce((n, c) => n + c.waypoints.length, 0)).toBe(100);
    }
  });

  it("keeps every waypoint when size is not a finite number", () => {
    const wps = circleForm(ORIGIN, 20, 8);
    for (const size of [NaN, undefined as unknown as number, "45" as unknown as number]) {
      const chunks = chunkWaypoints("m", wps, size);
      expect(chunks.reduce((n, c) => n + c.waypoints.length, 0)).toBe(wps.length);
    }
  });

  it("clamps a non-positive size to one waypoint per record", () => {
    const wps = circleForm(ORIGIN, 20, 4);
    const chunks = chunkWaypoints("m", wps, 0);
    expect(chunks).toHaveLength(wps.length);
    expect(chunks.reduce((n, c) => n + c.waypoints.length, 0)).toBe(wps.length);
  });
});

describe("longitude normalization", () => {
  it("wraps into [-180, 180) for arbitrarily large magnitudes", () => {
    expect(normalizeLongitude(537)).toBeCloseTo(177, 9);
    expect(normalizeLongitude(-1000)).toBeCloseTo(80, 9);
    expect(normalizeLongitude(9.4)).toBeCloseTo(9.4, 9);
    expect(normalizeLongitude(-180)).toBeCloseTo(-180, 9);
  });

  it("destinationPoint stays in range when crossing the antimeridian", () => {
    const p = destinationPoint({ lat: 0, lng: 179.999 }, 90, 500);
    expect(p.lng).toBeGreaterThanOrEqual(-180);
    expect(p.lng).toBeLessThan(180);
    expect(p.lng).toBeLessThan(0);
  });

  it("mirrorPoints stays in range across the antimeridian", () => {
    const [m] = mirrorPoints([{ lat: 0, lng: -179 }], { lat: 0, lng: 179 });
    expect(m.lng).toBeCloseTo(177, 9);
  });
});
