import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  buildChecklist,
  downloadBytes,
  downloadText,
  exportProjectJSON,
  waypointsToGeoJSON,
  type ProjectExport,
} from "./features/export";
import {
  bearingDeg,
  closeLoop,
  estimateDurationSeconds,
  maxDistanceMeters,
  mirrorPoints,
  pathLengthMeters,
} from "./features/mission/geometry";
import { fmtDuration } from "./features/mission/format";
import {
  buildForm,
  DEFAULT_FORM_PARAMS,
  type FormKind,
  type FormParams,
} from "./features/mission/formBuilder";
import { MapToolbar } from "./features/mission/MapToolbar";
import { MapView } from "./features/mission/MapView";
import type { Mission } from "./features/mission/missionTypes";
import { Sidebar } from "./features/mission/Sidebar";
import { useMissionLibrary, type SavedMission } from "./features/mission/useMissionLibrary";
import { hasBlockingErrors, validateMission } from "./features/mission/validator";
import { generateMapDb } from "./features/potensic/atomMapDb";
import { loadSql } from "./features/potensic/sqlLoader";
import { useLocationSearch } from "./hooks/useLocationSearch";
import { useMissionImport } from "./hooks/useMissionImport";
import { useTrackAnalysis } from "./hooks/useTrackAnalysis";
import { useUndoRedo } from "./hooks/useUndoRedo";

/** Type-guarding wrapper so callers get a narrowed `number` without a `!` assertion. */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const WORKSPACE_KEY = "atom-mission-workspace";
const WORKSPACE_VERSION = 1;

interface Workspace {
  v: number;
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
    if (!raw) return {};
    const data = JSON.parse(raw) as Partial<Workspace>;
    // Discard state persisted by an incompatible older version.
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- explicit null guard for type safety
    if (typeof data !== "object" || data === null || data.v !== WORKSPACE_VERSION) {
      localStorage.removeItem(WORKSPACE_KEY);
      return {};
    }
    // Validate numeric safety values so a corrupt entry cannot produce NaN.
    if (
      (data.heightM !== undefined && !Number.isFinite(data.heightM)) ||
      (data.speedMs !== undefined && !Number.isFinite(data.speedMs)) ||
      (data.batteryMin !== undefined && !Number.isFinite(data.batteryMin)) ||
      (data.reservePct !== undefined && !Number.isFinite(data.reservePct)) ||
      (data.geofenceM !== undefined && !Number.isFinite(data.geofenceM))
    ) {
      localStorage.removeItem(WORKSPACE_KEY);
      return {};
    }
    return data;
  } catch {
    return {};
  }
}

export default function App() {
  const initialWs = useMemo(() => loadWorkspace(), []);
  const [params, setParams] = useState<FormParams>(initialWs.params ?? DEFAULT_FORM_PARAMS);
  const [name, setName] = useState(initialWs.name ?? "Mission");
  const [heightM, setHeightM] = useState(initialWs.heightM ?? 20);
  const [speedMs, setSpeedMs] = useState(initialWs.speedMs ?? 5);
  const [chunkSize, setChunkSize] = useState(initialWs.chunkSize ?? 45);
  const [busy, setBusy] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const bumpFit = () => setFitSignal((n) => n + 1);
  const [fitAllSignal, setFitAllSignal] = useState(0);
  const fitAll = () => setFitAllSignal((n) => n + 1);

  // Safety & battery (Atom packs are ~20 min).
  const [batteryMin, setBatteryMin] = useState(initialWs.batteryMin ?? 20);
  const [reservePct, setReservePct] = useState(initialWs.reservePct ?? 25);
  const [geofenceM, setGeofenceM] = useState(initialWs.geofenceM ?? 150);

  // When on, the next map click drops the mission center instead of editing.
  const [dropCenterMode, setDropCenterMode] = useState(false);

  const set = (patch: Partial<FormParams>) => setParams((prev) => ({ ...prev, ...patch }));
  const { commit, undo, redo, canUndo, canRedo } = useUndoRedo(params, setParams);

  // useMissionImport needs to clear editingId, but editingId is only known once
  // useMissionLibrary (below) is constructed; a ref breaks the ordering cycle.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const editingIdClearRef = useRef<() => void>(() => {});
  const missionImport = useMissionImport({
    onImportSuccess: bumpFit,
    onEditingIdClear: () => editingIdClearRef.current(),
  });
  const { imported, importIndex, importName, setImported } = missionImport;

  const formWaypoints = useMemo(() => buildForm(params), [params]);
  const isImported = imported !== null && imported.records.length > 0;
  const activeRecord = isImported
    ? imported?.records[Math.min(importIndex, (imported.records.length ?? 0) - 1)]
    : null;
  const waypoints = activeRecord ? activeRecord.waypoints : formWaypoints;
  const activeName = activeRecord ? importName || "Imported" : name;
  const displayCenter =
    activeRecord && activeRecord.waypoints.length > 0 ? activeRecord.waypoints[0] : params.center;

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
  const durationFmt = fmtDuration(durationS);
  const headingLabel =
    waypoints.length > 1 ? `${Math.round(bearingDeg(waypoints[0], waypoints[1])) % 360}°` : "–";

  // Safety & battery.
  const homePoint =
    waypoints.length > 0 && (params.kind === "manual" || isImported) ? waypoints[0] : displayCenter;
  const maxHomeM = maxDistanceMeters(homePoint, waypoints);
  const usableMin = batteryMin * (1 - reservePct / 100);
  const flightMin = durationS / 60;
  const enduranceFrac = usableMin > 0 ? flightMin / usableMin : 0;
  const geofenceBreached = maxHomeM > geofenceM;

  const editable = params.kind === "manual" && !isImported;

  const trackAnalysis = useTrackAnalysis(waypoints);

  const locationSearch = useLocationSearch({
    onResult: (lat, lng) => {
      commit();
      setImported(null);
      set({ center: { lat, lng } });
    },
  });
  const { geoResult, setGeoResult } = locationSearch;
  // Auto-clear the geo-result success toast after 3 s.
  useEffect(() => {
    if (!geoResult) return;
    const t = setTimeout(() => setGeoResult(null), 3000);
    return () => clearTimeout(t);
  }, [geoResult, setGeoResult]);

  const {
    library: savedMissions,
    setLibrary,
    editingId,
    setEditingId,
    addToLibrary,
    renameEntry,
    removeEntry,
    duplicateEntry,
    loadEntry,
    libraryOverlays,
    libraryMissions,
  } = useMissionLibrary({
    initialEditingId: initialWs.editingId ?? null,
    isImported,
    activeName,
    waypoints,
    plannedHeightM: mission.plannedHeightM,
    plannedSpeedMs: mission.plannedSpeedMs,
    onLoadEntry: (partialParams, nm, h, s) => {
      setImported(null);
      setName(nm);
      setHeightM(h);
      setSpeedMs(s);
      setParams((prev) => ({ ...prev, ...partialParams }));
    },
    commit,
    bumpFit,
  });
  // eslint-disable-next-line react-hooks/refs -- intentional latest-ref pattern, see comment above
  editingIdClearRef.current = () => setEditingId(null);
  const onRename = (id: string, nm: string) => {
    renameEntry(id, nm);
    if (id === editingId) setName(nm);
  };

  // Persist the whole working state so a reload restores everything.
  useEffect(() => {
    const ws: Workspace = {
      v: WORKSPACE_VERSION,
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
  }, [params, name, heightM, speedMs, chunkSize, batteryMin, reservePct, geofenceM, editingId]);

  // Map resize-handle wiring: which parameter the drag handle controls per form.
  let resizeSizeM: number | null = null;
  let resizeBearing = 0;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let applyResize: (m: number) => void = () => {};
  if (params.kind === "circle" || params.kind === "polygon" || params.kind === "star") {
    resizeSizeM = params.radiusM;
    resizeBearing = params.headingDeg;
    applyResize = (m) => set({ radiusM: m });
  } else if (params.kind === "spiral") {
    resizeSizeM = params.radiusM;
    applyResize = (m) => set({ radiusM: m });
  } else if (params.kind === "line") {
    resizeSizeM = params.lengthM;
    resizeBearing = params.headingDeg;
    applyResize = (m) => set({ lengthM: m });
  }
  if (isImported) resizeSizeM = null;

  const handleMapClick = (wp: { lat: number; lng: number }) => {
    if (dropCenterMode) {
      if (!isImported) {
        commit();
        set({ center: wp });
      }
      setDropCenterMode(false);
      return;
    }
    if (isImported) return;
    if (params.kind === "manual") {
      commit();
      set({ manual: [...params.manual, wp] });
    } else {
      commit();
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

  const onSelectForm = (kind: FormKind) => {
    commit();
    setImported(null);
    setEditingId(null);
    set({ kind });
    bumpFit();
  };

  async function exportMapDb() {
    if (savedMissions.length === 0 && blocked) return;
    setBusy(true);
    try {
      const SQL = await loadSql();
      const missions = savedMissions.length > 0 ? libraryMissions : [mission];
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
      downloadBytes(bytes, "map.db");
    } finally {
      setBusy(false);
    }
  }

  function exportGeoJSON() {
    const slug = (mission.name || "mission").replace(/[^a-z0-9_-]+/gi, "_");
    downloadText(
      waypointsToGeoJSON(mission.name, waypoints),
      `${slug}.geojson`,
      "application/geo+json",
    );
  }

  function exportChecklist() {
    const slug = (mission.name || "field").replace(/[^a-z0-9_-]+/gi, "_");
    downloadText(
      buildChecklist(mission, distanceM, chunkCount),
      `${slug}-checklist.md`,
      "text/markdown",
    );
  }

  function exportProject() {
    const project: ProjectExport = {
      library: savedMissions,
      workspace: {
        v: WORKSPACE_VERSION,
        params,
        name,
        heightM,
        speedMs,
        chunkSize,
        batteryMin,
        reservePct,
        geofenceM,
        editingId,
      },
    };
    downloadText(exportProjectJSON(project), "atom-mission-lab-project.json", "application/json");
  }

  async function importProject(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { library?: unknown; workspace?: unknown };
      if (Array.isArray(data.library)) {
        const lib = (data.library as unknown[]).filter((item): item is SavedMission => {
          if (typeof item !== "object" || item === null) return false;
          const e2 = item as Record<string, unknown>;
          return (
            typeof e2.id === "string" &&
            typeof e2.name === "string" &&
            typeof e2.color === "string" &&
            Array.isArray(e2.waypoints) &&
            (e2.waypoints as unknown[]).every(
              (w): boolean =>
                typeof w === "object" &&
                w !== null &&
                Number.isFinite((w as Record<string, unknown>).lat) &&
                Number.isFinite((w as Record<string, unknown>).lng),
            ) &&
            Number.isFinite(e2.plannedHeightM) &&
            Number.isFinite(e2.plannedSpeedMs)
          );
        });
        setLibrary(lib);
      }
      const ws = data.workspace as Partial<Workspace> | undefined;
      if (ws && typeof ws === "object") {
        if (ws.params) setParams(ws.params);
        if (typeof ws.name === "string") setName(ws.name);
        if (isFiniteNumber(ws.heightM)) setHeightM(ws.heightM);
        if (isFiniteNumber(ws.speedMs)) setSpeedMs(ws.speedMs);
        if (isFiniteNumber(ws.chunkSize)) setChunkSize(ws.chunkSize);
        if (isFiniteNumber(ws.batteryMin)) setBatteryMin(ws.batteryMin);
        if (isFiniteNumber(ws.reservePct)) setReservePct(ws.reservePct);
        if (isFiniteNumber(ws.geofenceM)) setGeofenceM(ws.geofenceM);
        setEditingId(typeof ws.editingId === "string" ? ws.editingId : null);
      }
      bumpFit();
    } catch {
      /* silently ignore malformed project files */
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="layout">
      <Sidebar
        missionImport={missionImport}
        isImported={isImported}
        bumpFit={bumpFit}
        busy={busy}
        exportDisabled={savedMissions.length === 0 && blocked}
        waypointsEmpty={waypoints.length === 0}
        onExportMapDb={() => void exportMapDb()}
        onExportGeoJSON={exportGeoJSON}
        onExportChecklist={exportChecklist}
        onExportProject={exportProject}
        onImportProject={(e) => void importProject(e)}
        params={params}
        set={set}
        commit={commit}
        canUndo={canUndo}
        canRedo={canRedo}
        undo={undo}
        redo={redo}
        onSelectForm={onSelectForm}
        editAsPoints={editAsPoints}
        reversePoints={reversePoints}
        mirrorAcrossCenter={mirrorAcrossCenter}
        closeLoopPoints={closeLoopPoints}
        removeLastPoint={removeLastPoint}
        name={name}
        setName={setName}
        chunkSize={chunkSize}
        setChunkSize={setChunkSize}
        heightM={heightM}
        setHeightM={setHeightM}
        speedMs={speedMs}
        setSpeedMs={setSpeedMs}
        library={savedMissions}
        editingId={editingId}
        onAddToLibrary={() => addToLibrary(mission)}
        onFitAll={fitAll}
        onRename={onRename}
        onLoad={loadEntry}
        onDuplicate={duplicateEntry}
        onExportEntry={(e) => void exportEntry(e)}
        onRemove={removeEntry}
        batteryMin={batteryMin}
        setBatteryMin={setBatteryMin}
        reservePct={reservePct}
        setReservePct={setReservePct}
        geofenceM={geofenceM}
        setGeofenceM={setGeofenceM}
        enduranceFrac={enduranceFrac}
        durationFmt={durationFmt}
        usableMin={usableMin}
        maxHomeM={maxHomeM}
        waypointCount={waypoints.length}
        distanceM={distanceM}
        chunkCount={chunkCount}
        headingLabel={headingLabel}
        issues={issues}
        geofenceBreached={geofenceBreached}
        trackAnalysis={trackAnalysis}
      />

      <main className="map-wrap">
        <MapToolbar
          locationSearch={locationSearch}
          dropCenterMode={dropCenterMode}
          setDropCenterMode={setDropCenterMode}
          isImported={isImported}
        />
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
          actualTrack={trackAnalysis.actual ? trackAnalysis.actual.points : null}
          others={libraryOverlays}
          fitAllSignal={fitAllSignal}
          flyCenter={locationSearch.flyCenter}
          flySignal={locationSearch.flySignal}
          crosshair={dropCenterMode}
        />
      </main>
    </div>
  );
}
