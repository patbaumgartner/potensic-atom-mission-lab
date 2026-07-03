import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { downloadBytes, downloadText, waypointsToGeoJSON } from "./features/export";
import { MapView } from "./features/mission/MapView";
import {
  bearingDeg,
  closeLoop,
  estimateDurationSeconds,
  maxDistanceMeters,
  mirrorPoints,
  pathDeviation,
  pathLengthMeters,
} from "./features/mission/geometry";
import {
  buildForm,
  DEFAULT_FORM_PARAMS,
  type FormKind,
  type FormParams,
} from "./features/mission/formBuilder";
import { ATOM_LIMITS, type Mission, type Waypoint } from "./features/mission/missionTypes";
import { hasBlockingErrors, validateMission } from "./features/mission/validator";
import {
  generateMapDb,
  parseMapDb,
  type ParsedMapDb,
} from "./features/potensic/atomMapDb";
import { loadSql } from "./features/potensic/sqlLoader";
import { parseTrack, type ImportedTrack } from "./features/logs/trackImport";
import {
  formatSwissAddress,
  type NominatimAddress,
} from "./features/geo/formatAddress";

const FORMS: { kind: FormKind; label: string; glyph: string }[] = [
  { kind: "line", label: "Line", glyph: "╱" },
  { kind: "polygon", label: "Polygon", glyph: "⬟" },
  { kind: "circle", label: "Circle", glyph: "◯" },
  { kind: "grid", label: "Grid", glyph: "▦" },
  { kind: "spiral", label: "Spiral", glyph: "◎" },
  { kind: "star", label: "Star", glyph: "★" },
  { kind: "manual", label: "Manual", glyph: "✎" },
];

function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

interface SavedMission {
  id: string;
  name: string;
  color: string;
  waypoints: Waypoint[];
  plannedHeightM: number;
  plannedSpeedMs: number;
}

const LIBRARY_KEY = "atom-mission-library";
const WORKSPACE_KEY = "atom-mission-workspace";
const PALETTE = [
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#f59e0b",
];

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadLibrary(): SavedMission[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as SavedMission[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

interface Workspace {
  params: FormParams;
  name: string;
  heightM: number;
  speedMs: number;
  chunkSize: number;
  batteryMin: number;
  reservePct: number;
  geofenceM: number;
  editingId: string | null;
}

function loadWorkspace(): Partial<Workspace> {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Workspace>) : {};
  } catch {
    return {};
  }
}

export default function App() {
  const initialWs = useMemo(() => loadWorkspace(), []);
  const [params, setParams] = useState<FormParams>(
    initialWs.params ?? DEFAULT_FORM_PARAMS,
  );
  const [name, setName] = useState(initialWs.name ?? "Mission");
  const [heightM, setHeightM] = useState(initialWs.heightM ?? 20);
  const [speedMs, setSpeedMs] = useState(initialWs.speedMs ?? 5);
  const [chunkSize, setChunkSize] = useState(initialWs.chunkSize ?? 45);
  const [busy, setBusy] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const bumpFit = () => setFitSignal((n) => n + 1);
  const [fitAllSignal, setFitAllSignal] = useState(0);
  const fitAll = () => setFitAllSignal((n) => n + 1);
  const [imported, setImported] = useState<ParsedMapDb | null>(null);
  const [importIndex, setImportIndex] = useState(0);
  const [importName, setImportName] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);

  // Safety & battery (Atom packs are ~20 min).
  const [batteryMin, setBatteryMin] = useState(initialWs.batteryMin ?? 20);
  const [reservePct, setReservePct] = useState(initialWs.reservePct ?? 25);
  const [geofenceM, setGeofenceM] = useState(initialWs.geofenceM ?? 150);

  // Planned-vs-actual analysis.
  const [actual, setActual] = useState<ImportedTrack | null>(null);
  const [actualErr, setActualErr] = useState<string | null>(null);

  // Location search (geocoding).
  const [geoQuery, setGeoQuery] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [geoResult, setGeoResult] = useState<string | null>(null);
  const [flyCenter, setFlyCenter] = useState<Waypoint | null>(null);
  const [flySignal, setFlySignal] = useState(0);

  // Mission library: multiple missions exported into one map.db.
  const [library, setLibrary] = useState<SavedMission[]>(loadLibrary);
  const [editingId, setEditingId] = useState<string | null>(
    initialWs.editingId ?? null,
  );
  useEffect(() => {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    } catch {
      /* storage unavailable; keep in-memory only */
    }
  }, [library]);

  // Persist the whole working state so a reload restores everything.
  useEffect(() => {
    const ws: Workspace = {
      params,
      name,
      heightM,
      speedMs,
      chunkSize,
      batteryMin,
      reservePct,
      geofenceM,
      editingId,
    };
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
    } catch {
      /* storage unavailable; keep in-memory only */
    }
  }, [
    params,
    name,
    heightM,
    speedMs,
    chunkSize,
    batteryMin,
    reservePct,
    geofenceM,
    editingId,
  ]);

  // Undo/redo history over the editable form params.
  const [past, setPast] = useState<FormParams[]>([]);
  const [futureStack, setFutureStack] = useState<FormParams[]>([]);
  const commit = () => {
    setPast((p) => [...p.slice(-49), params]);
    setFutureStack([]);
  };
  const undo = () =>
    setPast((p) => {
      if (p.length === 0) return p;
      setFutureStack((f) => [params, ...f]);
      setParams(p[p.length - 1]);
      return p.slice(0, -1);
    });
  const redo = () =>
    setFutureStack((f) => {
      if (f.length === 0) return f;
      setPast((p) => [...p, params]);
      setParams(f[0]);
      return f.slice(1);
    });

  const formWaypoints = useMemo(() => buildForm(params), [params]);
  const isImported = imported !== null && imported.records.length > 0;
  const activeRecord = isImported
    ? imported!.records[Math.min(importIndex, imported!.records.length - 1)]
    : null;
  const waypoints = activeRecord ? activeRecord.waypoints : formWaypoints;
  const activeName = activeRecord ? importName || "Imported" : name;
  const displayCenter =
    activeRecord && activeRecord.waypoints.length > 0
      ? activeRecord.waypoints[0]
      : params.center;

  const mission: Mission = useMemo(
    () => ({
      name: activeName,
      waypoints,
      plannedHeightM: activeRecord ? activeRecord.heightM : heightM,
      plannedSpeedMs: activeRecord ? activeRecord.speedMs : speedMs,
    }),
    [activeName, waypoints, activeRecord, heightM, speedMs],
  );

  const issues = useMemo(() => validateMission(mission), [mission]);
  const blocked = hasBlockingErrors(issues);

  const distanceM = useMemo(() => pathLengthMeters(waypoints), [waypoints]);
  const durationS = useMemo(
    () => estimateDurationSeconds(waypoints, mission.plannedSpeedMs),
    [waypoints, mission.plannedSpeedMs],
  );
  const chunkCount = Math.max(1, Math.ceil(waypoints.length / chunkSize));

  // Safety & battery.
  const homePoint =
    waypoints.length > 0 && (params.kind === "manual" || isImported)
      ? waypoints[0]
      : displayCenter;
  const maxHomeM = maxDistanceMeters(homePoint, waypoints);
  const usableMin = batteryMin * (1 - reservePct / 100);
  const flightMin = durationS / 60;
  const enduranceFrac = usableMin > 0 ? flightMin / usableMin : 0;
  const geofenceBreached = maxHomeM > geofenceM;

  // Planned-vs-actual analysis.
  const deviation = actual ? pathDeviation(actual.points, waypoints) : null;
  const actualLenM = actual ? pathLengthMeters(actual.points) : 0;

  const editable = params.kind === "manual" && !isImported;

  // Live-sync edits back into the library entry being edited.
  useEffect(() => {
    if (!editingId || isImported) return;
    setLibrary((l) =>
      l.map((e) =>
        e.id === editingId
          ? {
              ...e,
              name: activeName,
              waypoints: waypoints.map((w) => ({ ...w })),
              plannedHeightM: mission.plannedHeightM,
              plannedSpeedMs: mission.plannedSpeedMs,
            }
          : e,
      ),
    );
  }, [
    editingId,
    isImported,
    activeName,
    waypoints,
    mission.plannedHeightM,
    mission.plannedSpeedMs,
  ]);

  const addToLibrary = () => {
    if (waypoints.length === 0) return;
    const entry: SavedMission = {
      id: uid(),
      name: mission.name || `Mission ${library.length + 1}`,
      color: PALETTE[library.length % PALETTE.length],
      waypoints: waypoints.map((w) => ({ ...w })),
      plannedHeightM: mission.plannedHeightM,
      plannedSpeedMs: mission.plannedSpeedMs,
    };
    setLibrary((l) => [...l, entry]);
    // Only link for live editing when the source is the editable current form,
    // not a read-only imported map.db record.
    if (!isImported) setEditingId(entry.id);
  };
  const renameEntry = (id: string, nm: string) => {
    setLibrary((l) => l.map((e) => (e.id === id ? { ...e, name: nm } : e)));
    if (id === editingId) setName(nm);
  };
  const removeEntry = (id: string) => {
    setLibrary((l) => l.filter((e) => e.id !== id));
    if (id === editingId) setEditingId(null);
  };
  const duplicateEntry = (id: string) =>
    setLibrary((l) => {
      const e = l.find((x) => x.id === id);
      if (!e) return l;
      return [
        ...l,
        {
          ...e,
          id: uid(),
          name: `${e.name} copy`,
          waypoints: e.waypoints.map((w) => ({ ...w })),
        },
      ];
    });
  const loadEntry = (e: SavedMission) => {
    commit();
    setImported(null);
    setName(e.name);
    setHeightM(e.plannedHeightM);
    setSpeedMs(e.plannedSpeedMs);
    setParams((prev) => ({
      ...prev,
      kind: "manual",
      manual: e.waypoints.map((w) => ({ ...w })),
    }));
    setEditingId(e.id);
    bumpFit();
  };
  const libraryMissions: Mission[] = library.map((e) => ({
    name: e.name,
    waypoints: e.waypoints,
    plannedHeightM: e.plannedHeightM,
    plannedSpeedMs: e.plannedSpeedMs,
  }));

  // Map resize-handle wiring: which parameter the drag handle controls per form.
  let resizeSizeM: number | null = null;
  let resizeBearing = 0;
  let applyResize: (m: number) => void = () => {};
  switch (params.kind) {
    case "circle":
    case "polygon":
    case "star":
      resizeSizeM = params.radiusM;
      resizeBearing = params.headingDeg;
      applyResize = (m) => set({ radiusM: m });
      break;
    case "spiral":
      resizeSizeM = params.radiusM;
      resizeBearing = 0;
      applyResize = (m) => set({ radiusM: m });
      break;
    case "line":
      resizeSizeM = params.lengthM;
      resizeBearing = params.headingDeg;
      applyResize = (m) => set({ lengthM: m });
      break;
    default:
      resizeSizeM = null;
  }
  if (isImported) resizeSizeM = null;

  const set = (patch: Partial<FormParams>) =>
    setParams((prev) => ({ ...prev, ...patch }));

  const handleMapClick = (wp: { lat: number; lng: number }) => {
    if (isImported) return;
    if (params.kind === "manual") {
      commit();
      set({ manual: [...params.manual, wp] });
    } else {
      set({ center: wp });
    }
  };

  const onWaypointDrag = (index: number, wp: { lat: number; lng: number }) => {
    if (params.kind !== "manual") return;
    commit();
    const next = params.manual.slice();
    next[index] = wp;
    set({ manual: next });
  };

  function editAsPoints() {
    commit();
    setParams((prev) => ({ ...prev, kind: "manual", manual: waypoints }));
    bumpFit();
  }
  function reversePoints() {
    commit();
    set({ manual: [...params.manual].reverse() });
  }
  function mirrorAcrossCenter() {
    commit();
    set({ manual: mirrorPoints(params.manual, params.center) });
  }
  function closeLoopPoints() {
    commit();
    set({ manual: closeLoop(params.manual) });
  }
  function removeLastPoint() {
    commit();
    set({ manual: params.manual.slice(0, -1) });
  }

  async function exportMapDb() {
    if (library.length === 0 && blocked) return;
    setBusy(true);
    try {
      const SQL = await loadSql();
      const missions = library.length > 0 ? libraryMissions : [mission];
      const bytes = generateMapDb(SQL, missions, { chunkSize });
      downloadBytes(bytes, "map.db");
    } finally {
      setBusy(false);
    }
  }

  async function exportEntry(e: SavedMission) {
    setBusy(true);
    try {
      const SQL = await loadSql();
      const bytes = generateMapDb(
        SQL,
        [
          {
            name: e.name,
            waypoints: e.waypoints,
            plannedHeightM: e.plannedHeightM,
            plannedSpeedMs: e.plannedSpeedMs,
          },
        ],
        { chunkSize },
      );
      const slug = (e.name || "mission").replace(/[^a-z0-9_-]+/gi, "_");
      downloadBytes(bytes, `${slug}.map.db`);
    } finally {
      setBusy(false);
    }
  }

  function exportGeoJSON() {
    downloadText(
      waypointsToGeoJSON(mission.name, waypoints),
      `${mission.name || "mission"}.geojson`,
      "application/geo+json",
    );
  }

  function exportChecklist() {
    downloadText(
      buildChecklist(mission, distanceM, chunkCount),
      `${mission.name}-checklist.md`,
      "text/markdown",
    );
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportErr(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const SQL = await loadSql();
      const parsed = parseMapDb(SQL, bytes);
      setImported(parsed);
      setImportIndex(0);
      setImportName(file.name.replace(/\.[^.]+$/, ""));
      setEditingId(null);
      if (parsed.records.length === 0) {
        setImportErr("No flight records found in this map.db.");
      }
      bumpFit();
    } catch {
      setImportErr("Could not read this file as a map.db.");
      setImported(null);
    } finally {
      e.target.value = "";
    }
  }

  async function searchLocation() {
    const q = geoQuery.trim();
    if (!q) return;
    setGeoBusy(true);
    setGeoErr(null);
    setGeoResult(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data: unknown = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setGeoErr("No match — try adding a country, e.g. “… Switzerland”.");
        return;
      }
      const hit = data[0] as {
        lat: string;
        lon: string;
        display_name?: string;
        address?: NominatimAddress;
      };
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setGeoErr("Invalid coordinates returned.");
        return;
      }
      commit();
      setImported(null);
      set({ center: { lat, lng } });
      setFlyCenter({ lat, lng });
      setFlySignal((n) => n + 1);
      const swiss = formatSwissAddress(hit.address);
      setGeoResult(
        swiss || hit.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      );
    } catch {
      setGeoErr("Location search failed (check network).");
    } finally {
      setGeoBusy(false);
    }
  }

  async function onImportTrack(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActualErr(null);
    try {
      const text = await file.text();
      const track = parseTrack(text, file.name);
      if (track.points.length === 0) {
        setActualErr("No coordinates found in that track file.");
        setActual(null);
      } else {
        setActual(track);
        bumpFit();
      }
    } catch {
      setActualErr("Could not parse that track file.");
      setActual(null);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="layout">
      <aside className="panel">
        <header className="brand">
          <DroneMark />
          <div>
            <h1>Potensic Atom Mission Lab</h1>
            <p className="tag">
              Program the flight · export <code>map.db</code>
            </p>
          </div>
        </header>

        <section>
          <h2>Load map.db</h2>
          <label className="filebtn">
            <input
              type="file"
              accept=".db,application/octet-stream,application/x-sqlite3"
              onChange={onImportFile}
              hidden
            />
            Import map.db…
          </label>
          {importErr && <p className="err-line">{importErr}</p>}
          {isImported && (
            <div className="import-panel">
              <p className="hint">
                Viewing <strong>{importName}</strong> ·{" "}
                {imported!.records.length} record(s) · read-only
              </p>
              <div className="record-list">
                {imported!.records.map((r, i) => (
                  <button
                    key={r.id}
                    className={i === importIndex ? "active" : ""}
                    onClick={() => {
                      setImportIndex(i);
                      bumpFit();
                    }}
                  >
                    {r.label || `record ${r.id}`} · {r.waypointCount} wp
                  </button>
                ))}
              </div>
              <button
                className="ghost"
                onClick={() => {
                  setImported(null);
                  bumpFit();
                }}
              >
                Clear import
              </button>
            </div>
          )}
        </section>

        <section>
          <h2>Form</h2>
          <div className="toolbar">
            <button onClick={undo} disabled={past.length === 0}>
              ↶ Undo
            </button>
            <button onClick={redo} disabled={futureStack.length === 0}>
              ↷ Redo
            </button>
          </div>
          <div className="forms">
            {FORMS.map((f) => (
              <button
                key={f.kind}
                className={`tile ${params.kind === f.kind ? "active" : ""}`}
                onClick={() => {
                  commit();
                  setImported(null);
                  setEditingId(null);
                  set({ kind: f.kind });
                  bumpFit();
                }}
              >
                <span className="f-glyph">{f.glyph}</span>
                <span className="f-label">{f.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Parameters</h2>
          {params.kind === "manual" ? (
            <div className="manual-controls">
              <p className="hint">
                Click the map to add points, or drag any point to move it (
                {params.manual.length}).
              </p>
              <div className="btn-row">
                <button onClick={reversePoints} disabled={params.manual.length < 2}>
                  Reverse
                </button>
                <button onClick={mirrorAcrossCenter} disabled={params.manual.length < 2}>
                  Mirror
                </button>
                <button onClick={closeLoopPoints} disabled={params.manual.length < 3}>
                  Close loop
                </button>
              </div>
              <div className="btn-row">
                <button onClick={removeLastPoint} disabled={params.manual.length === 0}>
                  Remove last
                </button>
                <button
                  onClick={() => {
                    commit();
                    set({ manual: [] });
                  }}
                  disabled={params.manual.length === 0}
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="params-list">{renderParams(params, set, commit)}</div>
              {!isImported && (
                <button className="ghost" onClick={editAsPoints}>
                  ✎ Edit as draggable points
                </button>
              )}
            </>
          )}
        </section>

        <section>
          <h2>Position &amp; orientation</h2>
          <div className="grid2">
            <label>
              Center lat
              <input
                type="number"
                step={0.0001}
                value={params.center.lat}
                onChange={(e) =>
                  set({ center: { ...params.center, lat: +e.target.value } })
                }
              />
            </label>
            <label>
              Center lng
              <input
                type="number"
                step={0.0001}
                value={params.center.lng}
                onChange={(e) =>
                  set({ center: { ...params.center, lng: +e.target.value } })
                }
              />
            </label>
          </div>
          <label className="slider">
            <span>Rotate <strong>{Math.round(params.headingDeg)}°</strong></span>
            <input
              type="range"
              min={0}
              max={359}
              value={params.headingDeg}
              onPointerDown={commit}
              onChange={(e) => set({ headingDeg: +e.target.value })}
            />
          </label>
          <button className="ghost" onClick={bumpFit}>
            Fit map to mission
          </button>
          <p className="hint">
            Tip: search an address above, click the map to move the center, or
            drag the amber handle to resize the form live.
          </p>
        </section>

        <section>
          <h2>Mission metadata</h2>
          <div className="params-list">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <SliderField
              label="Chunk size"
              value={chunkSize}
              min={1}
              max={45}
              step={1}
              onChange={setChunkSize}
            />
            <SliderField
              label="Height (manual)"
              unit=" m"
              value={heightM}
              min={0}
              max={120}
              step={1}
              onChange={setHeightM}
            />
            <SliderField
              label="Speed"
              unit=" m/s"
              value={speedMs}
              min={1}
              max={15}
              step={0.5}
              onChange={setSpeedMs}
            />
          </div>
          <p className="warn">
            Atom ignores per-waypoint height/gimbal. Climb to altitude manually
            before starting; these values are metadata only.
          </p>
        </section>

        <section>
          <h2>Mission library</h2>
          <button
            className="ghost"
            onClick={addToLibrary}
            disabled={waypoints.length === 0}
          >
            ＋ Add current to library
          </button>
          {library.length > 0 && (
            <div className="lib-list">
              <button className="ghost" onClick={fitAll}>
                ▣ Fit all missions on map
              </button>
              {library.map((e) => (
                <div
                  key={e.id}
                  className={`lib-item ${e.id === editingId ? "editing" : ""}`}
                >
                  <span className="lib-swatch" style={{ background: e.color }} />
                  <input
                    className="lib-name"
                    value={e.name}
                    onChange={(ev) => renameEntry(e.id, ev.target.value)}
                  />
                  <span className="lib-count">{e.waypoints.length} wp</span>
                  <div className="lib-actions">
                    <button title="Load for editing" onClick={() => loadEntry(e)}>
                      Load
                    </button>
                    <button title="Duplicate" onClick={() => duplicateEntry(e.id)}>
                      ⧉
                    </button>
                    <button title="Export just this" onClick={() => exportEntry(e)}>
                      ⭳
                    </button>
                    <button title="Remove" onClick={() => removeEntry(e.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <p className="hint">
                Export writes all {library.length} mission(s) into one{" "}
                <code>map.db</code>, each as its own PotensicPro route.
              </p>
            </div>
          )}
        </section>

        <section>
          <h2>Safety &amp; battery</h2>
          <div className="params-list">
            <SliderField label="Battery" unit=" min" value={batteryMin} min={5} max={35} step={1} onChange={setBatteryMin} />
            <SliderField label="Reserve" unit=" %" value={reservePct} min={0} max={50} step={5} onChange={setReservePct} />
            <SliderField label="Geofence radius" unit=" m" value={geofenceM} min={20} max={500} step={10} onChange={setGeofenceM} />
          </div>
          <div className={`battery-bar ${enduranceFrac > 1 ? "over" : enduranceFrac > 0.85 ? "near" : ""}`}>
            <div className="battery-fill" style={{ width: `${Math.min(100, enduranceFrac * 100)}%` }} />
          </div>
          <p className="hint">
            Uses {fmtDuration(durationS)} of ~{usableMin.toFixed(0)} min usable
            ({Math.round(enduranceFrac * 100)}%) · max {maxHomeM.toFixed(0)} m from home.
          </p>
        </section>

        <section className="stats">
          <StatCard icon="pin" label="Waypoints" value={String(waypoints.length)} />
          <StatCard icon="ruler" label="Distance" value={`${distanceM.toFixed(0)} m`} />
          <StatCard icon="clock" label="Est. time" value={fmtDuration(durationS)} />
          <StatCard icon="battery" label="Battery" value={`${Math.round(enduranceFrac * 100)}%`} />
          <StatCard icon="home" label="Max home" value={`${maxHomeM.toFixed(0)} m`} />
          <StatCard icon="layers" label="Chunks" value={String(chunkCount)} />
          <StatCard
            icon="compass"
            label="Heading"
            value={
              waypoints.length > 1
                ? `${bearingDeg(waypoints[0], waypoints[1]).toFixed(0)}°`
                : "–"
            }
          />
        </section>

        <section>
          <h2>Validation</h2>
          <ul className="issues">
            {issues.map((it, i) => (
              <li key={i} className={it.level}>{it.message}</li>
            ))}
            {enduranceFrac > 1 && (
              <li className="error">
                Flight time {fmtDuration(durationS)} exceeds usable battery (~{usableMin.toFixed(0)} min). Shorten the mission.
              </li>
            )}
            {enduranceFrac > 0.85 && enduranceFrac <= 1 && (
              <li className="warning">
                Flight uses {Math.round(enduranceFrac * 100)}% of usable battery — little margin for wind/RTH.
              </li>
            )}
            {geofenceBreached && (
              <li className="warning">
                Max distance from home {maxHomeM.toFixed(0)} m exceeds geofence {geofenceM} m.
              </li>
            )}
            {issues.length === 0 &&
              enduranceFrac <= 0.85 &&
              !geofenceBreached && <li className="info">No issues.</li>}
          </ul>
        </section>

        <section>
          <h2>Analysis</h2>
          <label className="filebtn">
            <input
              type="file"
              accept=".geojson,.json,.gpx,.csv,.kml"
              onChange={onImportTrack}
              hidden
            />
            Import flown track (GPX/GeoJSON/CSV)…
          </label>
          {actualErr && <p className="err-line">{actualErr}</p>}
          {actual && (
            <div className="import-panel">
              <p className="hint">
                <span className="legend-dot" /> Actual: <strong>{actual.name}</strong>{" "}
                · {actual.points.length} pts · {actualLenM.toFixed(0)} m
              </p>
              {deviation && (
                <div className="dev-grid">
                  <div><span>Max deviation</span><strong>{deviation.maxM.toFixed(1)} m</strong></div>
                  <div><span>Avg deviation</span><strong>{deviation.avgM.toFixed(1)} m</strong></div>
                  <div><span>Planned</span><strong>{distanceM.toFixed(0)} m</strong></div>
                  <div><span>Actual</span><strong>{actualLenM.toFixed(0)} m</strong></div>
                </div>
              )}
              <button
                className="ghost"
                onClick={() => {
                  setActual(null);
                  bumpFit();
                }}
              >
                Clear track
              </button>
            </div>
          )}
        </section>

        <section className="exports">
          <button
            className="primary"
            disabled={busy || (library.length === 0 && blocked)}
            onClick={exportMapDb}
          >
            {busy
              ? "Generating…"
              : library.length > 0
                ? `Export map.db (${library.length} missions)`
                : "Export map.db"}
          </button>
          <button disabled={waypoints.length === 0} onClick={exportGeoJSON}>Export GeoJSON</button>
          <button disabled={waypoints.length === 0} onClick={exportChecklist}>Field checklist</button>
        </section>

        <p className="hint">
          Max {ATOM_LIMITS.maxWaypointsPerRecord} waypoints per record; larger
          missions auto-chunk. Transfer with{" "}
          <code>debug-clone-tools/push-mapdb-to-clone.sh</code>.
        </p>
      </aside>

      <main className="map-wrap">
        <div className="map-search">
          <svg
            className="map-search-ic"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            placeholder="Search location (address or place)…"
            value={geoQuery}
            onChange={(e) => setGeoQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchLocation();
            }}
          />
          {geoQuery && (
            <button
              className="map-search-clear"
              aria-label="Clear"
              onClick={() => {
                setGeoQuery("");
                setGeoErr(null);
                setGeoResult(null);
              }}
            >
              ✕
            </button>
          )}
          <button
            className="map-search-go"
            onClick={searchLocation}
            disabled={geoBusy}
          >
            {geoBusy ? "…" : "Search"}
          </button>
        </div>
        {geoErr && <div className="map-search-err">{geoErr}</div>}
        {!geoErr && geoResult && (
          <div className="map-search-ok">
            <span aria-hidden>📍</span> {geoResult}
          </div>
        )}
        <MapView
          center={displayCenter}
          waypoints={waypoints}
          onMapClick={handleMapClick}
          fitSignal={fitSignal}
          sizeM={resizeSizeM}
          handleBearing={resizeBearing}
          onResize={applyResize}
          editable={editable}
          onWaypointDrag={onWaypointDrag}
          actualTrack={actual ? actual.points : null}
          others={library
            .filter((e) => e.id !== editingId)
            .map((e) => ({ points: e.waypoints, color: e.color }))}
          fitAllSignal={fitAllSignal}
          flyCenter={flyCenter}
          flySignal={flySignal}
        />
      </main>
    </div>
  );
}

type IconName = "pin" | "ruler" | "clock" | "layers" | "compass" | "battery" | "home";

function Icon({ name }: { name: IconName }) {
  const p = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "pin":
      return (
        <svg {...p}>
          <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" />
          <circle cx="12" cy="11" r="2" />
        </svg>
      );
    case "ruler":
      return (
        <svg {...p}>
          <path d="M3 17 17 3l4 4L7 21z" />
          <path d="M7 11l2 2M11 7l2 2M9 15l1 1" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "layers":
      return (
        <svg {...p}>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 13 9 5 9-5" />
        </svg>
      );
    case "compass":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="m16 8-5 3-3 5 5-3 3-5Z" />
        </svg>
      );
    case "battery":
      return (
        <svg {...p}>
          <rect x="2" y="8" width="16" height="9" rx="2" />
          <path d="M20 11v3" />
          <path d="M5 11v3M8 11v3" />
        </svg>
      );
    case "home":
      return (
        <svg {...p}>
          <path d="M4 11l8-6 8 6" />
          <path d="M6 10v9h12v-9" />
        </svg>
      );
  }
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <div className="stat">
      <span className="stat-ic">
        <Icon name={icon} />
      </span>
      <div className="stat-body">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function DroneMark() {
  return (
    <svg
      className="brand-mark"
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="5" cy="5" r="2.4" />
      <circle cx="19" cy="5" r="2.4" />
      <circle cx="5" cy="19" r="2.4" />
      <circle cx="19" cy="19" r="2.4" />
      <path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3" />
      <rect x="9.3" y="9.3" width="5.4" height="5.4" rx="1.3" />
    </svg>
  );
}

const PARAM_META: Record<
  string,
  { label: string; min: number; max: number; step: number; unit?: string }
> = {
  radiusM: { label: "Radius", min: 5, max: 200, step: 1, unit: " m" },
  lengthM: { label: "Length", min: 10, max: 400, step: 5, unit: " m" },
  spacingM: { label: "Spacing", min: 1, max: 50, step: 1, unit: " m" },
  sides: { label: "Sides", min: 3, max: 12, step: 1 },
  innerRadiusM: { label: "Inner radius", min: 2, max: 150, step: 1, unit: " m" },
  points: { label: "Points", min: 4, max: 48, step: 1 },
  widthM: { label: "Width", min: 10, max: 300, step: 5, unit: " m" },
  heightM: { label: "Height", min: 10, max: 300, step: 5, unit: " m" },
  passSpacingM: { label: "Pass spacing", min: 3, max: 40, step: 1, unit: " m" },
  startRadiusM: { label: "Start radius", min: 0, max: 100, step: 1, unit: " m" },
  turns: { label: "Turns", min: 1, max: 8, step: 1 },
};

function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  onCommit?: () => void;
}) {
  return (
    <label className="slider">
      <span>
        {label}
        <strong>
          {value}
          {unit}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onCommit}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
}

function renderParams(
  params: FormParams,
  set: (patch: Partial<FormParams>) => void,
  onCommit?: () => void,
) {
  const field = (k: keyof FormParams) => {
    const meta = PARAM_META[k as string];
    return (
      <SliderField
        key={k as string}
        label={meta.label}
        unit={meta.unit}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={params[k] as number}
        onCommit={onCommit}
        onChange={(v) => set({ [k]: v } as Partial<FormParams>)}
      />
    );
  };
  switch (params.kind) {
    case "line":
      return [field("lengthM"), field("spacingM")];
    case "polygon":
      return [field("radiusM"), field("sides")];
    case "circle":
      return [field("radiusM"), field("points")];
    case "grid":
      return [field("widthM"), field("heightM"), field("passSpacingM"), field("spacingM")];
    case "spiral":
      return [field("startRadiusM"), field("radiusM"), field("turns"), field("points")];
    case "star":
      return [field("radiusM"), field("innerRadiusM"), field("sides")];
    default:
      return null;
  }
}

function buildChecklist(
  mission: Mission,
  distanceM: number,
  chunks: number,
): string {
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
