import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  buildChecklist,
  buildCinematicChecklist,
  downloadBytes,
  downloadText,
  exportProjectJSON,
  MAX_PROJECT_FILE_BYTES,
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
  buildCinematicPlanFromForm,
  buildForm,
  type FormKind,
  type FormParams,
} from "./features/mission/formBuilder";
import { MapToolbar } from "./features/mission/MapToolbar";
import { MapView } from "./features/mission/MapView";
import {
  loadLibraryState,
  loadWorkspaceState,
  MAX_TEXT_LENGTH,
  PALETTE,
  parseProject,
  WORKSPACE_KEY,
  WORKSPACE_VERSION,
  type SavedMission,
} from "./features/mission/missionSchema";
import { ATOM_LIMITS, type Mission } from "./features/mission/missionTypes";
import { Sidebar } from "./features/mission/Sidebar";
import { useMissionLibrary } from "./features/mission/useMissionLibrary";
import {
  hasBlockingErrors,
  validateCinematicPlan,
  validateMission,
} from "./features/mission/validator";
import { generateMapDb } from "./features/potensic/atomMapDb";
import { loadSql } from "./features/potensic/sqlLoader";
import { useLocationSearch } from "./hooks/useLocationSearch";
import { useMissionImport } from "./hooks/useMissionImport";
import { useTrackAnalysis } from "./hooks/useTrackAnalysis";
import { useUndoRedo } from "./hooks/useUndoRedo";

export default function App() {
  const initialWorkspaceState = useMemo(() => loadWorkspaceState(), []);
  const initialWs = initialWorkspaceState.workspace;
  const initialLibraryState = useMemo(() => loadLibraryState(), []);
  const initialLibrary = initialLibraryState.library;
  const [params, setParams] = useState<FormParams>(initialWs.params);
  const [name, setName] = useState(initialWs.name);
  const [heightM, setHeightM] = useState(initialWs.heightM);
  const [speedMs, setSpeedMs] = useState(initialWs.speedMs);
  const [chunkSize, setChunkSize] = useState(initialWs.chunkSize);
  const [busy, setBusy] = useState(false);
  const [projectErr, setProjectErr] = useState<string | null>(null);
  const [cinematicActionMessage, setCinematicActionMessage] = useState<string | null>(null);
  const [persistenceErr, setPersistenceErr] = useState<string | null>(() => {
    if (initialWorkspaceState.persistenceBlocked) {
      return "Stored workspace is corrupt; import a valid project before saving changes.";
    }
    if (initialLibraryState.persistenceBlocked) {
      return "Stored mission library is corrupt; import a valid project before changing the library.";
    }
    return null;
  });
  const [workspacePersistenceBlocked, setWorkspacePersistenceBlocked] = useState(
    initialWorkspaceState.persistenceBlocked,
  );
  const [workspaceReplacementRevision, setWorkspaceReplacementRevision] = useState(0);
  const [fitSignal, setFitSignal] = useState(0);
  const bumpFit = () => setFitSignal((n) => n + 1);
  const [fitAllSignal, setFitAllSignal] = useState(0);
  const fitAll = () => setFitAllSignal((n) => n + 1);

  // Safety & battery (Atom packs are ~20 min).
  const [batteryMin, setBatteryMin] = useState(initialWs.batteryMin);
  const [reservePct, setReservePct] = useState(initialWs.reservePct);
  const [geofenceM, setGeofenceM] = useState(initialWs.geofenceM);

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

  const cinematicPlan = useMemo(
    () => (params.kind === "cinematic" ? buildCinematicPlanFromForm(params, heightM) : null),
    [params, heightM],
  );
  const formWaypoints = useMemo(() => {
    if (!cinematicPlan) return buildForm(params);
    if (params.cinematicMode === "route") return cinematicPlan.combinedRoute;
    const index = Math.min(
      cinematicPlan.shots.length - 1,
      Math.max(0, Math.round(params.cinematicViewIndex)),
    );
    return [...cinematicPlan.shots[index].waypoints];
  }, [params, cinematicPlan]);
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
  const cinematicShotMissions = useMemo<Mission[]>(() => {
    if (!cinematicPlan) return [];
    const baseName = name.trim() || "Cinematic House";
    return cinematicPlan.shots.map((shot) => ({
      name: `${baseName} - ${shot.label}`.slice(0, MAX_TEXT_LENGTH),
      waypoints: [...shot.waypoints],
      plannedHeightM: heightM,
      plannedSpeedMs: speedMs,
    }));
  }, [cinematicPlan, name, heightM, speedMs]);

  const missionIssues = useMemo(() => validateMission(mission), [mission]);

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
    replaceLibrary,
    editingId,
    setEditingId,
    addToLibrary,
    addManyToLibrary,
    renameEntry,
    removeEntry,
    duplicateEntry,
    loadEntry,
    libraryOverlays,
    libraryMissions,
  } = useMissionLibrary({
    initialLibrary,
    initialPersistenceBlocked: initialLibraryState.persistenceBlocked,
    initialEditingId: initialWs.editingId,
    syncBaselineRevision: workspaceReplacementRevision,
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
    onPersistenceError: setPersistenceErr,
  });
  const cinematicOverlays = useMemo(() => {
    if (!cinematicPlan || params.cinematicMode !== "shots") return [];
    const selectedIndex = Math.min(cinematicPlan.shots.length - 1, params.cinematicViewIndex);
    return cinematicPlan.shots
      .filter((shot) => shot.index !== selectedIndex)
      .map((shot) => ({
        points: [...shot.waypoints],
        color: PALETTE[shot.index % PALETTE.length],
      }));
  }, [cinematicPlan, params.cinematicMode, params.cinematicViewIndex]);
  const mapOverlays = useMemo(
    () => [...libraryOverlays, ...cinematicOverlays],
    [libraryOverlays, cinematicOverlays],
  );
  const cinematicGuides = useMemo(() => {
    if (!cinematicPlan) return null;
    const selectedIndex = Math.min(cinematicPlan.shots.length - 1, params.cinematicViewIndex);
    return {
      footprint: cinematicPlan.footprint,
      safetyEnvelope: cinematicPlan.safetyEnvelope,
      filmingPaths:
        params.cinematicMode === "route"
          ? cinematicPlan.shots.map((shot) => [...shot.filmingPath])
          : [[...cinematicPlan.shots[selectedIndex].filmingPath]],
    };
  }, [cinematicPlan, params.cinematicMode, params.cinematicViewIndex]);
  const cinematicIssues = useMemo(
    () =>
      cinematicPlan
        ? validateCinematicPlan(
            params,
            cinematicPlan,
            ATOM_LIMITS.maxLibraryEntries - savedMissions.length,
            heightM,
          )
        : [],
    [params, cinematicPlan, savedMissions.length, heightM],
  );
  const issues = useMemo(
    () => [...missionIssues, ...cinematicIssues],
    [missionIssues, cinematicIssues],
  );
  const blocked = hasBlockingErrors(issues);
  // eslint-disable-next-line react-hooks/refs -- intentional latest-ref pattern, see comment above
  editingIdClearRef.current = () => setEditingId(null);
  const onRename = (id: string, nm: string) => {
    renameEntry(id, nm);
    if (id === editingId) setName(nm);
  };

  // Persist the whole working state so a reload restores everything.
  useEffect(() => {
    if (workspacePersistenceBlocked) return;
    if (
      workspaceReplacementRevision === 0 &&
      params === initialWs.params &&
      name === initialWs.name &&
      heightM === initialWs.heightM &&
      speedMs === initialWs.speedMs &&
      chunkSize === initialWs.chunkSize &&
      batteryMin === initialWs.batteryMin &&
      reservePct === initialWs.reservePct &&
      geofenceM === initialWs.geofenceM &&
      editingId === initialWs.editingId
    ) {
      return;
    }
    try {
      localStorage.setItem(
        WORKSPACE_KEY,
        JSON.stringify({
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
        }),
      );
    } catch {
      queueMicrotask(() =>
        setPersistenceErr("Browser storage is unavailable; recent changes are not saved."),
      );
    }
  }, [
    initialWs,
    workspacePersistenceBlocked,
    workspaceReplacementRevision,
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
      if (params.manual.length >= ATOM_LIMITS.maxWaypointsPerMission) return;
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
    setParams((prev) => ({
      ...prev,
      kind: "manual",
      manual: waypoints.slice(0, ATOM_LIMITS.maxWaypointsPerMission),
    }));
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
    if (params.manual.length >= ATOM_LIMITS.maxWaypointsPerMission) {
      setProjectErr(
        `Route already has ${ATOM_LIMITS.maxWaypointsPerMission} points; remove one before closing the loop.`,
      );
      return;
    }
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

  function addCinematicShotPack() {
    const result = addManyToLibrary(cinematicShotMissions);
    if (result.ok) {
      setCinematicActionMessage(`Added ${result.count} independent shots to the mission library.`);
      fitAll();
      return;
    }
    const messages = {
      empty: "No cinematic shots are available.",
      invalid: "The shot pack contains invalid mission data.",
      capacity: "The mission library does not have room for the complete shot pack.",
      persistence: "The mission library is write-locked until a valid project is imported.",
    } as const;
    setCinematicActionMessage(messages[result.reason]);
  }

  async function exportCinematicShotPack() {
    if (!cinematicPlan || cinematicShotMissions.length === 0) return;
    setBusy(true);
    setCinematicActionMessage(null);
    try {
      const SQL = await loadSql();
      const bytes = generateMapDb(SQL, cinematicShotMissions, { chunkSize });
      downloadBytes(bytes, "cinematic-shot-pack-map.db");
      setCinematicActionMessage(`Exported ${cinematicShotMissions.length} independent shots.`);
    } finally {
      setBusy(false);
    }
  }

  function exportCinematicChecklist() {
    if (!cinematicPlan) return;
    const slug = (name || "cinematic-house").replace(/[^a-z0-9_-]+/gi, "_");
    downloadText(
      buildCinematicChecklist(name || "Cinematic House", cinematicPlan, {
        mode: params.cinematicMode,
        plannedHeightM: heightM,
        plannedSpeedMs: speedMs,
        leadInM: params.cinematicLeadInM,
      }),
      `${slug}-shot-checklist.md`,
      "text/markdown",
    );
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
    setProjectErr(null);
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) {
        setProjectErr("That project file is too large to import safely.");
        return;
      }
      const project = parseProject(JSON.parse(await file.text()));
      if (!project) {
        setProjectErr("That file is not an Atom Mission Lab project.");
        return;
      }
      const { library, workspace } = project;
      replaceLibrary(library);
      setWorkspacePersistenceBlocked(false);
      setWorkspaceReplacementRevision((revision) => revision + 1);
      setPersistenceErr(null);
      setImported(null);
      setParams(workspace.params);
      setName(workspace.name);
      setHeightM(workspace.heightM);
      setSpeedMs(workspace.speedMs);
      setChunkSize(workspace.chunkSize);
      setBatteryMin(workspace.batteryMin);
      setReservePct(workspace.reservePct);
      setGeofenceM(workspace.geofenceM);
      setEditingId(workspace.editingId);
      bumpFit();
    } catch {
      setProjectErr("Could not read that project file (invalid JSON).");
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
        projectErr={projectErr}
        persistenceErr={persistenceErr}
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
        cinematicPlan={cinematicPlan}
        cinematicActionMessage={cinematicActionMessage}
        onAddCinematicShotPack={addCinematicShotPack}
        onExportCinematicShotPack={() => void exportCinematicShotPack()}
        onExportCinematicChecklist={exportCinematicChecklist}
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
          others={mapOverlays}
          cinematicGuides={cinematicGuides}
          fitAllSignal={fitAllSignal}
          flyCenter={locationSearch.flyCenter}
          flySignal={locationSearch.flySignal}
          crosshair={dropCenterMode}
        />
      </main>
    </div>
  );
}
