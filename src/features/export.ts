// Export helpers: download a Uint8Array or text, and convert to GeoJSON.
import type { Waypoint } from "./mission/missionTypes";

export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = "application/octet-stream",
): void {
  const view = new Uint8Array(bytes);
  const blob = new Blob([view], { type: mime });
  triggerDownload(blob, filename);
}

export function downloadText(
  text: string,
  filename: string,
  mime = "text/plain",
): void {
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
