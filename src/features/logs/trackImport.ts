// Parse an actual flight track from common export formats for planned-vs-actual
// analysis: GeoJSON, GPX, and CSV (lat/lng columns).

import type { Waypoint } from "../mission/missionTypes";

export interface ImportedTrack {
  name: string;
  points: Waypoint[];
}

export function parseTrack(text: string, filename: string): ImportedTrack {
  const name = filename.replace(/\.[^.]+$/, "");
  const lower = filename.toLowerCase();
  const trimmed = text.trimStart();
  let points: Waypoint[];
  if (lower.endsWith(".gpx") || trimmed.startsWith("<")) {
    points = parseGpx(text);
  } else if (
    lower.endsWith(".geojson") ||
    lower.endsWith(".json") ||
    trimmed.startsWith("{")
  ) {
    points = parseGeoJSON(text);
  } else {
    points = parseCsv(text);
  }
  return { name, points };
}

function parseGpx(text: string): Waypoint[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const pts: Waypoint[] = [];
  doc.querySelectorAll("trkpt, rtept, wpt").forEach((el) => {
    const lat = parseFloat(el.getAttribute("lat") ?? "");
    const lng = parseFloat(el.getAttribute("lon") ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng });
  });
  return pts;
}

function parseGeoJSON(text: string): Waypoint[] {
  const data = JSON.parse(text) as unknown;
  const out: Waypoint[] = [];
  const addCoords = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    for (const c of coords) {
      if (Array.isArray(c) && c.length >= 2) {
        const lng = Number(c[0]);
        const lat = Number(c[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
      }
    }
  };
  const handleGeom = (g: any) => {
    if (!g || typeof g !== "object") return;
    switch (g.type) {
      case "LineString":
      case "MultiPoint":
        addCoords(g.coordinates);
        break;
      case "MultiLineString":
      case "Polygon":
        (g.coordinates as unknown[]).forEach(addCoords);
        break;
      case "Point":
        addCoords([g.coordinates]);
        break;
      default:
        break;
    }
  };
  const d = data as any;
  if (d?.type === "FeatureCollection") {
    (d.features as any[]).forEach((f) => handleGeom(f?.geometry));
  } else if (d?.type === "Feature") {
    handleGeom(d.geometry);
  } else {
    handleGeom(d);
  }
  return out;
}

function parseCsv(text: string): Waypoint[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const split = (l: string) => l.split(/[,;\t]/).map((s) => s.trim());
  const header = split(lines[0]).map((h) => h.toLowerCase());
  let latIdx = header.findIndex((h) => /^lat/.test(h));
  let lngIdx = header.findIndex((h) => /^(lng|lon|long)/.test(h));
  let start = 1;
  if (latIdx < 0 || lngIdx < 0) {
    latIdx = 0;
    lngIdx = 1;
    start = 0;
  }
  const out: Waypoint[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = split(lines[i]);
    const lat = parseFloat(parts[latIdx]);
    const lng = parseFloat(parts[lngIdx]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
  }
  return out;
}
