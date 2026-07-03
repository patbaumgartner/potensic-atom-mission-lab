// Export helpers: download a Uint8Array or text, and convert to GeoJSON.
import type { Mission, Waypoint } from "./mission/missionTypes";

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
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Serialize the mission library + workspace state into a portable JSON blob. */
export function exportProjectJSON(project: ProjectExport): string {
  return JSON.stringify({ ...project, exportedAt: new Date().toISOString() }, null, 2);
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
