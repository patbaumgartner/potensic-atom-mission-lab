// Custom hook that owns mission-library state, persistence, live-sync, and CRUD.
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormParams } from "./formBuilder";
import { LIBRARY_KEY, MAX_TEXT_LENGTH, PALETTE, uid, type SavedMission } from "./missionSchema";
import { ATOM_LIMITS, type Mission, type Waypoint } from "./missionTypes";

interface UseMissionLibraryOptions {
  initialLibrary: SavedMission[];
  initialPersistenceBlocked: boolean;
  initialEditingId: string | null;
  syncBaselineRevision: number;
  isImported: boolean;
  activeName: string;
  waypoints: Waypoint[];
  plannedHeightM: number;
  plannedSpeedMs: number;
  /** Called when loadEntry needs to restore form params, name, height, speed. */
  onLoadEntry: (
    partialParams: Pick<FormParams, "kind" | "manual">,
    name: string,
    heightM: number,
    speedMs: number,
  ) => void;
  commit: () => void;
  bumpFit: () => void;
  onPersistenceError: (message: string) => void;
}

export function useMissionLibrary({
  initialLibrary,
  initialPersistenceBlocked,
  initialEditingId,
  syncBaselineRevision,
  isImported,
  activeName,
  waypoints,
  plannedHeightM,
  plannedSpeedMs,
  onLoadEntry,
  commit,
  bumpFit,
  onPersistenceError,
}: UseMissionLibraryOptions) {
  const [library, setLibrary] = useState<SavedMission[]>(initialLibrary);
  const [editingId, setEditingId] = useState<string | null>(initialEditingId);
  const [persistenceBlocked, setPersistenceBlocked] = useState(initialPersistenceBlocked);
  const initialSyncValues = useRef({ activeName, waypoints, plannedHeightM, plannedSpeedMs });
  const hasPostMountEdit = useRef(false);
  const observedBaselineRevision = useRef(syncBaselineRevision);

  const mutationAllowed = () => {
    if (!persistenceBlocked) return true;
    onPersistenceError(
      "Stored mission library is corrupt; import a valid project before changing the library.",
    );
    return false;
  };

  // Persist library to localStorage.
  useEffect(() => {
    if (library === initialLibrary || persistenceBlocked) return;
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    } catch {
      onPersistenceError("Browser storage is unavailable; library changes are not saved.");
    }
  }, [initialLibrary, library, onPersistenceError, persistenceBlocked]);

  useEffect(() => {
    if (observedBaselineRevision.current === syncBaselineRevision) return;
    observedBaselineRevision.current = syncBaselineRevision;
    initialSyncValues.current = { activeName, waypoints, plannedHeightM, plannedSpeedMs };
    hasPostMountEdit.current = false;
  }, [syncBaselineRevision, activeName, waypoints, plannedHeightM, plannedSpeedMs]);

  // Live-sync edits back into the library entry being edited.
  useEffect(() => {
    if (
      persistenceBlocked ||
      !editingId ||
      isImported ||
      waypoints.length > ATOM_LIMITS.maxWaypointsPerMission
    ) {
      return;
    }
    if (!hasPostMountEdit.current) {
      const initial = initialSyncValues.current;
      if (
        activeName === initial.activeName &&
        waypoints === initial.waypoints &&
        plannedHeightM === initial.plannedHeightM &&
        plannedSpeedMs === initial.plannedSpeedMs
      ) {
        return;
      }
      hasPostMountEdit.current = true;
    }
    setLibrary((l) => {
      if (!l.some((e) => e.id === editingId)) return l;
      return l.map((e) =>
        e.id === editingId
          ? {
              ...e,
              name: activeName,
              waypoints: waypoints.map((w) => ({ ...w })),
              plannedHeightM,
              plannedSpeedMs,
            }
          : e,
      );
    });
  }, [
    persistenceBlocked,
    editingId,
    isImported,
    activeName,
    waypoints,
    plannedHeightM,
    plannedSpeedMs,
  ]);

  const addToLibrary = (mission: Mission) => {
    if (!mutationAllowed()) return;
    if (
      mission.waypoints.length === 0 ||
      mission.waypoints.length > ATOM_LIMITS.maxWaypointsPerMission ||
      !Number.isFinite(mission.plannedHeightM) ||
      mission.plannedHeightM < 0 ||
      mission.plannedHeightM > ATOM_LIMITS.maxPlannedHeightM ||
      !Number.isFinite(mission.plannedSpeedMs) ||
      mission.plannedSpeedMs < 0 ||
      mission.plannedSpeedMs > ATOM_LIMITS.maxPlannedSpeedMs
    ) {
      return;
    }
    if (library.length >= ATOM_LIMITS.maxLibraryEntries) return;
    const entry: SavedMission = {
      id: uid(),
      name: (mission.name || `Mission ${library.length + 1}`).slice(0, MAX_TEXT_LENGTH),
      color: PALETTE[library.length % PALETTE.length],
      waypoints: mission.waypoints.map((w) => ({ ...w })),
      plannedHeightM: mission.plannedHeightM,
      plannedSpeedMs: mission.plannedSpeedMs,
    };
    setLibrary((l) => [...l, entry]);
    if (!isImported) setEditingId(entry.id);
  };

  const renameEntry = (id: string, nm: string) => {
    if (!mutationAllowed()) return;
    setLibrary((l) =>
      l.map((e) => (e.id === id ? { ...e, name: nm.slice(0, MAX_TEXT_LENGTH) } : e)),
    );
  };

  const removeEntry = (id: string) => {
    if (!mutationAllowed()) return;
    setLibrary((l) => l.filter((e) => e.id !== id));
    if (id === editingId) setEditingId(null);
  };

  const duplicateEntry = (id: string) => {
    if (!mutationAllowed()) return;
    setLibrary((l) => {
      const e = l.find((x) => x.id === id);
      if (!e || l.length >= ATOM_LIMITS.maxLibraryEntries) return l;
      return [
        ...l,
        {
          ...e,
          id: uid(),
          name: `${e.name} copy`.slice(0, MAX_TEXT_LENGTH),
          waypoints: e.waypoints.map((w) => ({ ...w })),
        },
      ];
    });
  };

  const replaceLibrary = (replacement: SavedMission[]) => {
    setPersistenceBlocked(false);
    setLibrary(replacement);
  };

  const loadEntry = (e: SavedMission) => {
    commit();
    onLoadEntry(
      { kind: "manual", manual: e.waypoints.map((w) => ({ ...w })) },
      e.name,
      e.plannedHeightM,
      e.plannedSpeedMs,
    );
    setEditingId(e.id);
    bumpFit();
  };

  const libraryOverlays = useMemo(
    () =>
      library
        .filter((e) => e.id !== editingId)
        .map((e) => ({ points: e.waypoints, color: e.color })),
    [library, editingId],
  );

  const libraryMissions: Mission[] = library.map((e) => ({
    name: e.name,
    waypoints: e.waypoints,
    plannedHeightM: e.plannedHeightM,
    plannedSpeedMs: e.plannedSpeedMs,
  }));

  return {
    library,
    replaceLibrary,
    editingId,
    setEditingId,
    addToLibrary,
    renameEntry,
    removeEntry,
    duplicateEntry,
    loadEntry,
    libraryOverlays,
    libraryMissions,
  };
}
