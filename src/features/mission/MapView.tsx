import L from "leaflet";
import { useEffect, useRef } from "react";
import { bearingDeg, destinationPoint, haversineMeters } from "./geometry";
import type { Waypoint } from "./missionTypes";

interface MapViewProps {
  center: Waypoint;
  waypoints: Waypoint[];
  onMapClick: (wp: Waypoint) => void;
  /** Increment to re-fit the map to the current mission bounds. */
  fitSignal: number;
  /** Current handle distance from center (m), or null to hide the handle. */
  sizeM: number | null;
  /** Bearing from center at which to place the resize handle. */
  handleBearing: number;
  /** Called continuously while the handle is dragged, with the new size (m). */
  onResize: (sizeM: number) => void;
  /** When true, waypoint markers are draggable. */
  editable: boolean;
  /** Called after a waypoint marker is dragged to a new position. */
  onWaypointDrag: (index: number, wp: Waypoint) => void;
  /** Optional actual flown track to overlay for planned-vs-actual analysis. */
  actualTrack: Waypoint[] | null;
  /** Other stored missions to render dimmed beneath the active one. */
  others?: { points: Waypoint[]; color: string }[];
  /** Increment to fit the map to all missions (active + others). */
  fitAllSignal?: number;
  /** A coordinate to fly the map to (e.g. a search result). */
  flyCenter?: Waypoint | null;
  /** Increment to trigger a fly-to `flyCenter`. */
  flySignal?: number;
}

function dotIcon(label: string, variant: "mid" | "start" | "end"): L.DivIcon {
  return L.divIcon({
    className: `wp-marker wp-${variant}`,
    html: `<span>${label}</span>`,
    iconSize: variant === "mid" ? [20, 20] : [26, 26],
    iconAnchor: variant === "mid" ? [10, 10] : [13, 13],
  });
}

function arrowIcon(bearing: number): L.DivIcon {
  return L.divIcon({
    className: "wp-arrow",
    html: `<div class="wp-arrow-inner" style="transform:rotate(${bearing}deg)">➤</div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function handleIcon(): L.DivIcon {
  return L.divIcon({
    className: "resize-handle",
    html: `<div class="rh"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export function MapView({
  center,
  waypoints,
  onMapClick,
  fitSignal,
  sizeM,
  handleBearing,
  onResize,
  editable,
  onWaypointDrag,
  actualTrack,
  others = [],
  fitAllSignal = 0,
  flyCenter = null,
  flySignal = 0,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const handleRef = useRef<L.Marker | null>(null);
  const guideRef = useRef<L.Polyline | null>(null);
  const draggingRef = useRef(false);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const onWaypointDragRef = useRef(onWaypointDrag);
  onWaypointDragRef.current = onWaypointDrag;
  // Always read the latest center inside the (once-bound) drag handler.
  const centerRef = useRef(center);
  centerRef.current = center;

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const streets = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: "© OpenStreetMap contributors" },
    );
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      },
    );
    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 17,
      layers: [satellite],
    });
    L.control
      .layers({ Satellite: satellite, Streets: streets }, {}, { position: "topright" })
      .addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      clickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      handleRef.current = null;
      guideRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw the mission overlay when waypoints or center change.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    // Other stored missions, drawn dimmed beneath the active mission.
    for (const other of others) {
      if (other.points.length > 1) {
        L.polyline(
          other.points.map((w) => [w.lat, w.lng] as [number, number]),
          { color: other.color, weight: 3, opacity: 0.65, dashArray: "4 5" },
        ).addTo(layer);
      }
    }

    // Actual flown track (planned-vs-actual overlay), drawn beneath the plan.
    if (actualTrack && actualTrack.length > 1) {
      L.polyline(
        actualTrack.map((w) => [w.lat, w.lng] as [number, number]),
        { color: "#f472b6", weight: 2.5, opacity: 0.85, dashArray: "6 4" },
      ).addTo(layer);
    }

    if (waypoints.length > 0) {
      const latlngs = waypoints.map((w) => [w.lat, w.lng] as [number, number]);
      L.polyline(latlngs, {
        color: "#0b1220",
        weight: 7,
        opacity: 0.55,
        lineJoin: "round",
      }).addTo(layer);
      L.polyline(latlngs, {
        color: "#38bdf8",
        weight: 3,
        opacity: 0.95,
        lineJoin: "round",
      }).addTo(layer);
      // Animated "flow" overlay conveys travel direction along the path.
      L.polyline(latlngs, {
        color: "#a5f3fc",
        weight: 3,
        opacity: 0.9,
        lineJoin: "round",
        dashArray: "1 14",
        className: "flow-line",
      }).addTo(layer);

      for (let i = 1; i < waypoints.length; i++) {
        const a = waypoints[i - 1];
        const b = waypoints[i];
        const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
        L.marker([mid.lat, mid.lng], {
          icon: arrowIcon(bearingDeg(a, b)),
          interactive: false,
          keyboard: false,
        }).addTo(layer);
      }

      waypoints.forEach((w, i) => {
        const variant =
          i === 0 ? "start" : i === waypoints.length - 1 ? "end" : "mid";
        const label =
          i === 0 ? "S" : i === waypoints.length - 1 ? "E" : String(i + 1);
        const marker = L.marker([w.lat, w.lng], {
          icon: dotIcon(label, variant),
          draggable: editable,
        });
        if (editable) {
          marker.on("dragend", () => {
            const ll = marker.getLatLng();
            onWaypointDragRef.current(i, { lat: ll.lat, lng: ll.lng });
          });
        }
        marker.addTo(layer);
      });
    }

    L.circleMarker([center.lat, center.lng], {
      radius: 6,
      color: "#f43f5e",
      weight: 2,
      fillColor: "#f43f5e",
      fillOpacity: 0.35,
    }).addTo(layer);
  }, [waypoints, center, editable, actualTrack, others]);

  // Re-fit to the mission on demand.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (waypoints.length >= 2) {
      map.fitBounds(
        L.latLngBounds(waypoints.map((w) => [w.lat, w.lng] as [number, number])),
        { padding: [48, 48], maxZoom: 19 },
      );
    } else {
      map.setView([center.lat, center.lng], 17);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  // Fit to every mission (active + stored library previews).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitAllSignal === 0) return;
    const all: [number, number][] = [
      ...waypoints.map((w) => [w.lat, w.lng] as [number, number]),
      ...others.flatMap((o) =>
        o.points.map((w) => [w.lat, w.lng] as [number, number]),
      ),
    ];
    if (all.length >= 2) {
      map.fitBounds(L.latLngBounds(all), { padding: [48, 48], maxZoom: 19 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAllSignal]);

  // Fly to a searched coordinate.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyCenter || flySignal === 0) return;
    map.flyTo([flyCenter.lat, flyCenter.lng], 16, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flySignal]);

  // Draggable resize handle for radius/length based forms.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (sizeM == null) {
      if (handleRef.current) {
        map.removeLayer(handleRef.current);
        handleRef.current = null;
      }
      if (guideRef.current) {
        map.removeLayer(guideRef.current);
        guideRef.current = null;
      }
      return;
    }

    const pos = destinationPoint(center, handleBearing, sizeM);
    const posLL: [number, number] = [pos.lat, pos.lng];
    const centerLL: [number, number] = [center.lat, center.lng];

    if (!handleRef.current) {
      guideRef.current = L.polyline([centerLL, posLL], {
        color: "#fbbf24",
        weight: 1.5,
        opacity: 0.9,
        dashArray: "4 5",
        interactive: false,
      }).addTo(map);
      const marker = L.marker(posLL, {
        icon: handleIcon(),
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);
      marker.bindTooltip("Drag to resize", { direction: "top", offset: [0, -12] });
      marker.on("dragstart", () => {
        draggingRef.current = true;
      });
      marker.on("drag", () => {
        const c = centerRef.current;
        const ll = marker.getLatLng();
        const d = Math.max(2, haversineMeters(c, { lat: ll.lat, lng: ll.lng }));
        guideRef.current?.setLatLngs([[c.lat, c.lng], [ll.lat, ll.lng]]);
        onResizeRef.current(Math.round(d * 10) / 10);
      });
      marker.on("dragend", () => {
        draggingRef.current = false;
      });
      handleRef.current = marker;
    } else if (!draggingRef.current) {
      handleRef.current.setLatLng(posLL);
      guideRef.current?.setLatLngs([centerLL, posLL]);
    }
  }, [center, sizeM, handleBearing]);

  return <div ref={containerRef} className="map" />;
}
