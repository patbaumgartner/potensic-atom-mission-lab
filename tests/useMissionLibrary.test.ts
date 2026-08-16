// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SavedMission } from "../src/features/mission/missionSchema";
import { ATOM_LIMITS } from "../src/features/mission/missionTypes";
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
    waypoints: [{ lat: 47.4, lng: 9.3 }],
    plannedHeightM: 20,
    plannedSpeedMs: 5,
    onLoadEntry: vi.fn(),
    commit: vi.fn(),
    bumpFit: vi.fn(),
    onPersistenceError: vi.fn(),
  };
}

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
    const divergent = [{ lat: 1, lng: 2 }];
    const hookOptions = {
      ...options(false),
      initialLibrary: [saved],
      initialEditingId: saved.id,
      activeName: "Workspace",
      waypoints: divergent,
    };
    const { result, rerender } = renderHook(
      ({ activeName }) => useMissionLibrary({ ...hookOptions, activeName }),
      { initialProps: { activeName: "Workspace" } },
    );

    expect(result.current.library).toEqual([saved]);

    rerender({ activeName: "Edited after mount" });

    expect(result.current.library[0]).toEqual({
      ...saved,
      name: "Edited after mount",
      waypoints: divergent,
    });
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
});
