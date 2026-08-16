// Export helpers: download a Uint8Array or text, and convert to GeoJSON.
import type { CinematicMode, CinematicPlan } from "./mission/cinematic";
import type { Mission, Waypoint } from "./mission/missionTypes";

// Compact schema-maximum projects are ~24 MiB; leave headroom for UTF-8 names.
export const MAX_PROJECT_FILE_BYTES = 32 * 1024 * 1024;

export interface ProjectExport {
  library: unknown;
  workspace: unknown;
}

export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = "application/octet-stream",
): void {
  const view = new Uint8Array(bytes);
  const blob = new Blob([view], { type: mime });
  triggerDownload(blob, filename);
}

export function downloadText(text: string, filename: string, mime = "text/plain"): void {
  triggerDownload(new Blob([text], { type: mime }), filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeDownloadFilename(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeDownloadFilename(filename: string): string {
  const withoutControlCharacters = Array.from(filename, (character) => {
    const codePoint = character.charCodeAt(0);
    return codePoint <= 31 || codePoint === 127 ? "_" : character;
  }).join("");
  const sanitized = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .trim()
    .slice(0, 180);
  return sanitized || "download";
}

/** Serialize the mission library + workspace state into a portable JSON blob. */
export function exportProjectJSON(project: ProjectExport): string {
  return JSON.stringify({ ...project, exportedAt: new Date().toISOString() });
}

/** GeoJSON uses [lng, lat] order; multipointbean stores lat, lng. */
export function waypointsToGeoJSON(name: string, waypoints: Waypoint[]): string {
  const coords = waypoints.map((w) => [w.lng, w.lat]);
  const geo = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name },
        geometry: { type: "LineString", coordinates: coords },
      },
      ...waypoints.map((w, i) => ({
        type: "Feature",
        properties: { name: `wp-${i + 1}`, index: i + 1 },
        geometry: { type: "Point", coordinates: [w.lng, w.lat] },
      })),
    ],
  };
  return JSON.stringify(geo, null, 2);
}

/** Plain-text field checklist for a printed/offline pre-flight briefing. */
export function buildChecklist(mission: Mission, distanceM: number, chunks: number): string {
  return [
    `# Field checklist — ${mission.name}`,
    "",
    `- Waypoints: ${mission.waypoints.length} (${chunks} chunk(s))`,
    `- Path distance: ${distanceM.toFixed(0)} m`,
    `- Planned height: ${mission.plannedHeightM} m (set MANUALLY)`,
    `- Planned speed: ${mission.plannedSpeedMs} m/s`,
    "",
    "## Steps",
    "1. Back up current map.db (transfer script does this automatically).",
    "2. Push generated map.db to the debug clone.",
    "3. Open PotensicPro Debug and select the mission/chunk.",
    "4. Take off and climb MANUALLY to the planned altitude.",
    "5. Set gimbal angle manually if needed.",
    "6. Enable interval photos if mapping.",
    "7. Start the mission; keep line of sight and controller override ready.",
    "8. Stop interval photos, return home, land.",
    "9. Pull logs and compare planned vs actual.",
  ].join("\n");
}

export function buildCinematicChecklist(
  name: string,
  plan: CinematicPlan,
  options: {
    mode: CinematicMode;
    plannedHeightM: number;
    plannedSpeedMs: number;
    leadInM: number;
  },
): string {
  return [
    `# Cinematic shot checklist — ${name}`,
    "",
    `- Output: ${options.mode === "shots" ? `${plan.shots.length} independent shots` : "single route with repositioning legs"}`,
    `- Planned altitude: ${options.plannedHeightM} m (set manually)`,
    `- Planned speed: ${options.plannedSpeedMs} m/s (confirm on controller)`,
    `- Closest center distance: ${plan.safetyRadiusM.toFixed(1)} m`,
    `- Starting distance: ${plan.stagingDistanceM.toFixed(1)} m`,
    `- Fixed gimbal pitch: ${plan.gimbal.pitchDeg.toFixed(0)}°`,
    `- Trim from each clip: first ${options.leadInM.toFixed(0)} m`,
    "",
    "## Views",
    ...plan.shots.map(
      (shot) =>
        `${shot.index + 1}. ${shot.label}: start at ${shot.subjectBearingDeg.toFixed(0)}°, fly heading ${shot.flightBearingDeg.toFixed(0)}° toward the subject.`,
    ),
    "",
    "## Field setup",
    "1. Confirm the building footprint, clearance envelope, obstacles and legal airspace on site.",
    "2. Climb to the planned altitude and set the fixed gimbal pitch manually.",
    "3. Start recording manually before each filming leg; the mission does not command the camera.",
    "4. Confirm the aircraft nose follows each straight leg and keep controller override ready.",
    "5. Trim the lead-in footage in post.",
    ...(options.mode === "route"
      ? ["6. Do not use outbound or outer-ring repositioning legs as filming footage."]
      : []),
    "",
    "No yaw, gimbal, altitude, speed or recording command is encoded per waypoint.",
  ].join("\n");
}
