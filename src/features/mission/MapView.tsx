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
  /** When true, show a crosshair cursor (drop-center mode). */
  crosshair?: boolean;
  /** When true, the center marker is draggable (shape forms only). */
  centerDraggable?: boolean;
  /** Called when the center marker is dragged to a new position. */
  onCenterDrag?: (wp: Waypoint) => void;
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
  // The ➤ glyph rests pointing east (90° in compass terms), while `bearing` is
  // a compass bearing (0° = north). Offset by -90° so the rendered arrow
  // actually points along the segment's direction of travel instead of 90°
  // clockwise from it.
  return L.divIcon({
    className: "wp-arrow",
    html: `<div class="wp-arrow-inner" style="transform:rotate(${bearing - 90}deg)">➤</div>`,
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

function centerDragIcon(): L.DivIcon {
  return L.divIcon({
    className: "center-marker center-draggable",
    html: `<div class="cm-inner"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
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
  crosshair = false,
  centerDraggable = false,
  onCenterDrag,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Three independent layer groups so each redraws only on its own deps.
  const missionLayerRef = useRef<L.LayerGroup | null>(null);
  const othersLayerRef = useRef<L.LayerGroup | null>(null);
  const trackLayerRef = useRef<L.LayerGroup | null>(null);
  const clickRef = useRef(onMapClick);
  // Stable refs that always hold the latest callback/value without re-binding event listeners.
  // eslint-disable-next-line react-hooks/refs -- intentional latest-ref pattern
  clickRef.current = onMapClick;
  const handleRef = useRef<L.Marker | null>(null);
  const guideRef = useRef<L.Polyline | null>(null);
  const centerMarkerRef = useRef<L.Marker | L.CircleMarker | null>(null);
  const draggingRef = useRef(false);
  const onResizeRef = useRef(onResize);
  // eslint-disable-next-line react-hooks/refs -- intentional latest-ref pattern
  onResizeRef.current = onResize;
  const onWaypointDragRef = useRef(onWaypointDrag);
  // eslint-disable-next-line react-hooks/refs -- intentional latest-ref pattern
  onWaypointDragRef.current = onWaypointDrag;
  const onCenterDragRef = useRef(onCenterDrag);
  // eslint-disable-next-line react-hooks/refs -- intentional latest-ref pattern
  onCenterDragRef.current = onCenterDrag;
  // Always read the latest center inside the (once-bound) drag handlers.
  const centerRef = useRef(center);
  // eslint-disable-next-line react-hooks/refs -- intentional latest-ref pattern
  centerRef.current = center;

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const streets = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    });
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
    // Layer order: others (bottom) → track → mission (top)
    othersLayerRef.current = L.layerGroup().addTo(map);
    trackLayerRef.current = L.layerGroup().addTo(map);
    missionLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Leaflet only auto-corrects its internal size on a native `window` resize
    // event. Any other cause of the container changing size — the responsive
    // sidebar breakpoint stacking/unstacking, a scrollbar appearing/
    // disappearing, etc. — leaves Leaflet's cached size stale, so tiles and
    // markers render at the wrong pixel offsets (visually looks "cropped").
    // A ResizeObserver on the container catches every such case.
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      handleRef.current = null;
      guideRef.current = null;
      centerMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw library overlays only when `others` changes.
  useEffect(() => {
    const layer = othersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const other of others) {
      if (other.points.length > 1) {
        L.polyline(
          other.points.map((w) => [w.lat, w.lng] as [number, number]),
          { color: other.color, weight: 3, opacity: 0.65, dashArray: "4 5" },
        ).addTo(layer);
      }
    }
  }, [others]);

  // Redraw the actual-track overlay only when `actualTrack` changes.
  useEffect(() => {
    const layer = trackLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (actualTrack && actualTrack.length > 1) {
      L.polyline(
        actualTrack.map((w) => [w.lat, w.lng] as [number, number]),
        { color: "#f472b6", weight: 2.5, opacity: 0.85, dashArray: "6 4" },
      ).addTo(layer);
    }
  }, [actualTrack]);

  // Redraw the active mission overlay when waypoints, center, or editable changes.
  useEffect(() => {
    const layer = missionLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    centerMarkerRef.current = null;

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
        const variant = i === 0 ? "start" : i === waypoints.length - 1 ? "end" : "mid";
        const label = i === 0 ? "S" : i === waypoints.length - 1 ? "E" : String(i + 1);
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

    // Center marker: draggable when centerDraggable, static circle otherwise.
    if (centerDraggable) {
      const cm = L.marker([center.lat, center.lng], {
        icon: centerDragIcon(),
        draggable: true,
        zIndexOffset: 900,
      });
      cm.bindTooltip("Drag to move center", { direction: "top", offset: [0, -12] });
      cm.on("dragend", () => {
        const ll = cm.getLatLng();
        onCenterDragRef.current?.({ lat: ll.lat, lng: ll.lng });
      });
      cm.addTo(layer);
      centerMarkerRef.current = cm;
    } else {
      const cm = L.circleMarker([center.lat, center.lng], {
        radius: 6,
        color: "#f43f5e",
        weight: 2,
        fillColor: "#f43f5e",
        fillOpacity: 0.35,
      });
      cm.addTo(layer);
      centerMarkerRef.current = cm;
    }
  }, [waypoints, center, editable, centerDraggable]);

  // Re-fit to the mission on demand.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (waypoints.length >= 2) {
      map.fitBounds(L.latLngBounds(waypoints.map((w) => [w.lat, w.lng] as [number, number])), {
        padding: [48, 48],
        maxZoom: 19,
      });
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
      ...others.flatMap((o) => o.points.map((w) => [w.lat, w.lng] as [number, number])),
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
        guideRef.current?.setLatLngs([
          [c.lat, c.lng],
          [ll.lat, ll.lng],
        ]);
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

  // Leaflet appends its own classes (leaflet-container, leaflet-touch, ...)
  // directly to the DOM node it's given, outside React's control. If React
  // ever re-renders THAT SAME node with a different `className` prop value
  // (as it does here whenever `crosshair` toggles), React overwrites the
  // whole className attribute and wipes Leaflet's classes out — silently
  // dropping the `overflow: hidden`/`position: relative` leaflet-container
  // provides, which then makes tiles render at the wrong offsets ("cropped").
  // Keeping the ever-changing className on an outer wrapper (never touched by
  // Leaflet) and giving Leaflet a plain, static-className inner node avoids
  // the conflict entirely.
  return (
    <div className={crosshair ? "map map-crosshair" : "map"}>
      <div ref={containerRef} className="map-canvas" />
    </div>
  );
}
