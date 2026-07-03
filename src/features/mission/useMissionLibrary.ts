// Custom hook that owns mission-library state, persistence, live-sync, and CRUD.
import { useEffect, useMemo, useState } from "react";
import type { FormParams } from "./formBuilder";
import type { Mission, Waypoint } from "./missionTypes";

export interface SavedMission {
  id: string;
  name: string;
  color: string;
  waypoints: Waypoint[];
  plannedHeightM: number;
  plannedSpeedMs: number;
}

export const LIBRARY_KEY = "atom-mission-library";

export const PALETTE = [
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#f59e0b",
];

export function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isValidWaypoint(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const w = v as Record<string, unknown>;
  return Number.isFinite(w.lat) && Number.isFinite(w.lng);
}

export function loadLibrary(): SavedMission[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return (data as unknown[]).filter((item): item is SavedMission => {
      if (typeof item !== "object" || item === null) return false;
      const e = item as Record<string, unknown>;
      return (
        typeof e.id === "string" &&
        typeof e.name === "string" &&
        typeof e.color === "string" &&
        Array.isArray(e.waypoints) &&
        (e.waypoints as unknown[]).every(isValidWaypoint) &&
        Number.isFinite(e.plannedHeightM) &&
        Number.isFinite(e.plannedSpeedMs)
      );
    });
  } catch {
    return [];
  }
}

interface UseMissionLibraryOptions {
  initialEditingId: string | null;
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
}

export function useMissionLibrary({
  initialEditingId,
  isImported,
  activeName,
  waypoints,
  plannedHeightM,
  plannedSpeedMs,
  onLoadEntry,
  commit,
  bumpFit,
}: UseMissionLibraryOptions) {
  const [library, setLibrary] = useState<SavedMission[]>(loadLibrary);
  const [editingId, setEditingId] = useState<string | null>(initialEditingId);

  // Persist library to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    } catch {
      /* storage unavailable; keep in-memory only */
    }
  }, [library]);

  // Live-sync edits back into the library entry being edited.
  useEffect(() => {
    if (!editingId || isImported) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional live-sync pattern
    setLibrary((l) =>
      l.map((e) =>
        e.id === editingId
          ? {
              ...e,
              name: activeName,
              waypoints: waypoints.map((w) => ({ ...w })),
              plannedHeightM,
              plannedSpeedMs,
            }
          : e,
      ),
    );
  }, [editingId, isImported, activeName, waypoints, plannedHeightM, plannedSpeedMs]);

  const addToLibrary = (mission: Mission) => {
    if (mission.waypoints.length === 0) return;
    const entry: SavedMission = {
      id: uid(),
      name: mission.name || `Mission ${library.length + 1}`,
      color: PALETTE[library.length % PALETTE.length],
      waypoints: mission.waypoints.map((w) => ({ ...w })),
      plannedHeightM: mission.plannedHeightM,
      plannedSpeedMs: mission.plannedSpeedMs,
    };
    setLibrary((l) => [...l, entry]);
    if (!isImported) setEditingId(entry.id);
  };

  const renameEntry = (id: string, nm: string) =>
    setLibrary((l) => l.map((e) => (e.id === id ? { ...e, name: nm } : e)));

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
  };
}
