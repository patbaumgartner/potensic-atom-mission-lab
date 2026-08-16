// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIBRARY_KEY,
  MAX_TEXT_LENGTH,
  PALETTE,
  type SavedMission,
} from "../src/features/mission/missionSchema";
import { ATOM_LIMITS, type Mission } from "../src/features/mission/missionTypes";
import { useMissionLibrary } from "../src/features/mission/useMissionLibrary";

const existing: SavedMission = {
  id: "existing",
  name: "Existing",
  color: "#fff",
  waypoints: [{ lat: 47.4, lng: 9.3 }],
  plannedHeightM: 20,
  plannedSpeedMs: 5,
};

function options(initialPersistenceBlocked: boolean) {
  return {
    initialLibrary: [] as SavedMission[],
    initialPersistenceBlocked,
    initialEditingId: null,
    syncBaselineRevision: 0,
    isImported: false,
    activeName: "Mission",
    waypoints: existing.waypoints,
    plannedHeightM: 20,
    plannedSpeedMs: 5,
    onLoadEntry: vi.fn(),
    commit: vi.fn(),
    bumpFit: vi.fn(),
    onPersistenceError: vi.fn(),
  };
}

const mission: Mission = {
  name: "New",
  waypoints: [{ lat: 47.4, lng: 9.3 }],
  plannedHeightM: 20,
  plannedSpeedMs: 5,
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useMissionLibrary persistence lock", () => {
  it("does not overwrite corrupt storage when Add is attempted", () => {
    const raw = "corrupt library bytes";
    localStorage.setItem("atom-mission-library", raw);
    const hookOptions = options(true);
    const { result } = renderHook(() => useMissionLibrary(hookOptions));

    act(() =>
      result.current.addToLibrary({
        name: "New",
        waypoints: [{ lat: 47.4, lng: 9.3 }],
        plannedHeightM: 20,
        plannedSpeedMs: 5,
      }),
    );

    expect(result.current.library).toEqual([]);
    expect(localStorage.getItem("atom-mission-library")).toBe(raw);
    expect(hookOptions.onPersistenceError).toHaveBeenCalledOnce();
  });

  it("adds a complete shot pack atomically and leaves editing clear", () => {
    const { result } = renderHook(() => useMissionLibrary(options(false)));
    const missions = Array.from({ length: 8 }, (_, index) => ({
      name: `View ${index + 1}`,
      waypoints: [{ lat: 47.4 + index / 1_000, lng: 9.3 }],
      plannedHeightM: 20,
      plannedSpeedMs: 3,
    }));
    let outcome: ReturnType<typeof result.current.addManyToLibrary> | undefined;

    act(() => {
      outcome = result.current.addManyToLibrary(missions);
    });

    expect(outcome).toEqual({ ok: true, count: 8 });
    expect(result.current.library).toHaveLength(8);
    expect(result.current.library.map((entry) => entry.name)).toEqual(
      missions.map((mission) => mission.name),
    );
    expect(result.current.editingId).toBeNull();
  });

  it("does not partially add a pack when capacity is insufficient", () => {
    const initialLibrary = Array.from(
      { length: ATOM_LIMITS.maxLibraryEntries - 1 },
      (_, index) => ({
        ...existing,
        id: `${index}`,
      }),
    );
    const hookOptions = { ...options(false), initialLibrary };
    const { result } = renderHook(() => useMissionLibrary(hookOptions));

    let outcome: ReturnType<typeof result.current.addManyToLibrary> | undefined;
    act(() => {
      outcome = result.current.addManyToLibrary([
        { ...existing, plannedHeightM: 20, plannedSpeedMs: 5 },
        { ...existing, plannedHeightM: 20, plannedSpeedMs: 5 },
      ]);
    });

    expect(outcome).toEqual({ ok: false, reason: "capacity" });
    expect(result.current.library).toHaveLength(ATOM_LIMITS.maxLibraryEntries - 1);
  });

  it("does not partially add an invalid pack", () => {
    const { result } = renderHook(() => useMissionLibrary(options(false)));

    let outcome: ReturnType<typeof result.current.addManyToLibrary> | undefined;
    act(() => {
      outcome = result.current.addManyToLibrary([
        { name: "Valid", waypoints: [{ lat: 1, lng: 2 }], plannedHeightM: 20, plannedSpeedMs: 5 },
        { name: "Invalid", waypoints: [], plannedHeightM: 20, plannedSpeedMs: 5 },
      ]);
    });

    expect(outcome).toEqual({ ok: false, reason: "invalid" });
    expect(result.current.library).toEqual([]);
  });

  it("does not add missions with metadata outside the persisted domain", () => {
    const { result } = renderHook(() => useMissionLibrary(options(false)));

    act(() =>
      result.current.addToLibrary({
        name: "Invalid",
        waypoints: [{ lat: 47.4, lng: 9.3 }],
        plannedHeightM: 10_001,
        plannedSpeedMs: 5,
      }),
    );

    expect(result.current.library).toEqual([]);
  });

  it("waits for a post-mount edit before live-syncing a saved mission", () => {
    const saved = {
      ...existing,
      waypoints: [
        { lat: 47.4, lng: 9.3 },
        { lat: 47.5, lng: 9.4 },
      ],
    };
    const other = { ...existing, id: "other" };
    const divergent = [{ lat: 1, lng: 2 }];
    const hookOptions = {
      ...options(false),
      initialLibrary: [saved, other],
      initialEditingId: saved.id,
      activeName: "Workspace",
      waypoints: divergent,
    };
    const { result, rerender } = renderHook(
      ({ activeName }) => useMissionLibrary({ ...hookOptions, activeName }),
      { initialProps: { activeName: "Workspace" } },
    );

    expect(result.current.library).toEqual([saved, other]);

    rerender({ activeName: "Edited after mount" });

    expect(result.current.library[0]).toEqual({
      ...saved,
      name: "Edited after mount",
      waypoints: divergent,
    });
    expect(result.current.library[1]).toEqual(other);

    rerender({ activeName: "Edited again" });

    expect(result.current.library[0].name).toBe("Edited again");
  });

  it("unlocks persistence after an explicit project replacement", () => {
    localStorage.setItem("atom-mission-library", "corrupt library bytes");
    const { result } = renderHook(() => useMissionLibrary(options(true)));

    act(() => result.current.replaceLibrary([existing]));

    expect(result.current.library).toEqual([existing]);
    expect(JSON.parse(localStorage.getItem("atom-mission-library") ?? "[]")).toEqual([existing]);
  });

  it("resets live-sync to a linked project replacement baseline", () => {
    const imported = {
      ...existing,
      waypoints: [
        { lat: 47.4, lng: 9.3 },
        { lat: 47.5, lng: 9.4 },
      ],
    };
    const workspaceWaypoints = [{ lat: 1, lng: 2 }];
    const initial = options(false);
    const { result, rerender } = renderHook(
      ({ activeName, waypoints, syncBaselineRevision }) =>
        useMissionLibrary({
          ...initial,
          activeName,
          waypoints,
          syncBaselineRevision,
        }),
      {
        initialProps: {
          activeName: initial.activeName,
          waypoints: initial.waypoints,
          syncBaselineRevision: 0,
        },
      },
    );

    act(() => {
      result.current.replaceLibrary([imported]);
      result.current.setEditingId(imported.id);
    });
    rerender({
      activeName: "Imported workspace",
      waypoints: workspaceWaypoints,
      syncBaselineRevision: 1,
    });

    expect(result.current.library).toEqual([imported]);

    rerender({
      activeName: "Edited after import",
      waypoints: workspaceWaypoints,
      syncBaselineRevision: 1,
    });
    expect(result.current.library[0]).toEqual({
      ...imported,
      name: "Edited after import",
      waypoints: workspaceWaypoints,
    });
  });

  it("reports storage failures instead of losing them silently", () => {
    const hookOptions = options(false);
    const { result } = renderHook(() => useMissionLibrary(hookOptions));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    act(() => result.current.addToLibrary(mission));

    expect(hookOptions.onPersistenceError).toHaveBeenCalledWith(
      "Browser storage is unavailable; library changes are not saved.",
    );
    expect(result.current.library).toHaveLength(1);
  });

  it("rejects a batch add with no missions before touching the library", () => {
    const hookOptions = options(false);
    const { result } = renderHook(() => useMissionLibrary(hookOptions));

    let outcome: ReturnType<typeof result.current.addManyToLibrary> | undefined;
    act(() => {
      outcome = result.current.addManyToLibrary([]);
    });

    expect(outcome).toEqual({ ok: false, reason: "empty" });
    expect(hookOptions.onPersistenceError).not.toHaveBeenCalled();
  });

  it("rejects a batch add while the library is locked", () => {
    const hookOptions = options(true);
    const { result } = renderHook(() => useMissionLibrary(hookOptions));

    let outcome: ReturnType<typeof result.current.addManyToLibrary> | undefined;
    act(() => {
      outcome = result.current.addManyToLibrary([mission]);
    });

    expect(outcome).toEqual({ ok: false, reason: "persistence" });
    expect(result.current.library).toEqual([]);
  });
});

describe("useMissionLibrary entry management", () => {
  it("adds a mission, colors it from the palette, and starts editing it", () => {
    const { result } = renderHook(() => useMissionLibrary(options(false)));

    act(() => result.current.addToLibrary(mission));

    expect(result.current.library).toHaveLength(1);
    expect(result.current.library[0]).toMatchObject({ name: "New", color: PALETTE[0] });
    expect(result.current.editingId).toBe(result.current.library[0].id);
    expect(JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "[]")).toEqual(result.current.library);
  });

  it("names an unnamed mission after its library position", () => {
    const { result } = renderHook(() => useMissionLibrary(options(false)));

    act(() => result.current.addToLibrary({ ...mission, name: "" }));

    expect(result.current.library[0].name).toBe("Mission 1");
  });

  it("keeps an imported mission out of the live-sync editing slot", () => {
    const { result } = renderHook(() => useMissionLibrary({ ...options(false), isImported: true }));

    act(() => result.current.addToLibrary(mission));

    expect(result.current.library).toHaveLength(1);
    expect(result.current.editingId).toBeNull();
  });

  it("refuses to add beyond the library capacity", () => {
    const full = Array.from({ length: ATOM_LIMITS.maxLibraryEntries }, (_, index) => ({
      ...existing,
      id: `${index}`,
    }));
    const { result } = renderHook(() =>
      useMissionLibrary({ ...options(false), initialLibrary: full }),
    );

    act(() => result.current.addToLibrary(mission));

    expect(result.current.library).toHaveLength(ATOM_LIMITS.maxLibraryEntries);
  });

  it("renames an entry and truncates an over-long name", () => {
    const other = { ...existing, id: "other" };
    const { result } = renderHook(() =>
      useMissionLibrary({ ...options(false), initialLibrary: [existing, other] }),
    );

    act(() => result.current.renameEntry(existing.id, "x".repeat(MAX_TEXT_LENGTH + 50)));

    expect(result.current.library[0].name).toHaveLength(MAX_TEXT_LENGTH);
    expect(result.current.library[1]).toEqual(other);
  });

  it("removes an entry and stops editing it", () => {
    const { result } = renderHook(() =>
      useMissionLibrary({
        ...options(false),
        initialLibrary: [existing],
        initialEditingId: existing.id,
      }),
    );

    act(() => result.current.removeEntry(existing.id));

    expect(result.current.library).toEqual([]);
    expect(result.current.editingId).toBeNull();
  });

  it("keeps the editing selection when removing another entry", () => {
    const other = { ...existing, id: "other" };
    const hookOptions = {
      ...options(false),
      initialLibrary: [existing, other],
      initialEditingId: existing.id,
    };
    const { result } = renderHook(() => useMissionLibrary(hookOptions));

    act(() => result.current.removeEntry(other.id));

    expect(result.current.library).toEqual([existing]);
    expect(result.current.editingId).toBe(existing.id);
  });

  it("duplicates an entry with its own id and copied waypoints", () => {
    const { result } = renderHook(() =>
      useMissionLibrary({ ...options(false), initialLibrary: [existing] }),
    );

    act(() => result.current.duplicateEntry(existing.id));

    const [original, copy] = result.current.library;
    expect(copy.name).toBe("Existing copy");
    expect(copy.id).not.toBe(original.id);
    expect(copy.waypoints).toEqual(original.waypoints);
    expect(copy.waypoints[0]).not.toBe(original.waypoints[0]);
  });

  it("ignores a duplicate request for an unknown entry", () => {
    const { result } = renderHook(() =>
      useMissionLibrary({ ...options(false), initialLibrary: [existing] }),
    );

    act(() => result.current.duplicateEntry("does-not-exist"));

    expect(result.current.library).toEqual([existing]);
  });

  it("refuses to duplicate beyond the library capacity", () => {
    const full = Array.from({ length: ATOM_LIMITS.maxLibraryEntries }, (_, index) => ({
      ...existing,
      id: `${index}`,
    }));
    const { result } = renderHook(() =>
      useMissionLibrary({ ...options(false), initialLibrary: full }),
    );

    act(() => result.current.duplicateEntry("0"));

    expect(result.current.library).toHaveLength(ATOM_LIMITS.maxLibraryEntries);
  });

  it("blocks every entry mutation while the stored library is corrupt", () => {
    const hookOptions = { ...options(true), initialLibrary: [existing] };
    const { result } = renderHook(() => useMissionLibrary(hookOptions));

    act(() => {
      result.current.renameEntry(existing.id, "Renamed");
      result.current.removeEntry(existing.id);
      result.current.duplicateEntry(existing.id);
    });

    expect(result.current.library).toEqual([existing]);
    expect(hookOptions.onPersistenceError).toHaveBeenCalledTimes(3);
  });

  it("loads an entry into the workspace as an undoable manual path", () => {
    const hookOptions = { ...options(false), initialLibrary: [existing] };
    const { result } = renderHook(() => useMissionLibrary(hookOptions));

    act(() => result.current.loadEntry(existing));

    expect(hookOptions.commit).toHaveBeenCalledOnce();
    expect(hookOptions.bumpFit).toHaveBeenCalledOnce();
    expect(hookOptions.onLoadEntry).toHaveBeenCalledWith(
      { kind: "manual", manual: existing.waypoints },
      existing.name,
      existing.plannedHeightM,
      existing.plannedSpeedMs,
    );
    const [params] = hookOptions.onLoadEntry.mock.calls[0] as [{ manual: unknown[] }];
    expect(params.manual[0]).not.toBe(existing.waypoints[0]);
    expect(result.current.editingId).toBe(existing.id);
  });

  it("draws every library entry except the one being edited", () => {
    const other = { ...existing, id: "other", color: "#000" };
    const { result } = renderHook(() =>
      useMissionLibrary({
        ...options(false),
        initialLibrary: [existing, other],
        initialEditingId: existing.id,
      }),
    );

    expect(result.current.libraryOverlays).toEqual([
      { points: other.waypoints, color: other.color },
    ]);
  });

  it("ignores live-sync edits once the edited entry is gone", () => {
    const hookOptions = {
      ...options(false),
      initialLibrary: [existing],
      initialEditingId: "already-removed",
    };
    const { result, rerender } = renderHook(
      ({ activeName }) => useMissionLibrary({ ...hookOptions, activeName }),
      { initialProps: { activeName: "Mission" } },
    );

    rerender({ activeName: "Edited after mount" });

    expect(result.current.library).toEqual([existing]);
  });
});
