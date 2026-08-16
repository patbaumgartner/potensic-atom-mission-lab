// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAP_DB_PARSE_LIMITS } from "../src/features/potensic/atomMapDb";
import { useMissionImport } from "../src/hooks/useMissionImport";

const { loadSqlMock, parseMapDbMock } = vi.hoisted(() => ({
  loadSqlMock: vi.fn(),
  parseMapDbMock: vi.fn(),
}));

vi.mock("../src/features/potensic/sqlLoader", () => ({ loadSql: loadSqlMock }));
vi.mock("../src/features/potensic/atomMapDb", () => ({
  parseMapDb: parseMapDbMock,
  DEFAULT_MAP_DB_PARSE_LIMITS: {
    maxRecords: 10_000,
    maxWaypointsPerRecord: 2_000,
    maxTotalWaypoints: 400_000,
    maxFlightHistoryEntries: 100_000,
  },
}));

function importEvent(name = "route.db", size = 1): React.ChangeEvent<HTMLInputElement> {
  const file = { name, size, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) } as File;
  return {
    target: { files: [file], value: name },
  } as unknown as React.ChangeEvent<HTMLInputElement>;
}

function parsedMapDb(waypoints: unknown[]) {
  return {
    userVersion: 5,
    tables: [],
    records: [
      {
        id: 1,
        label: "Route",
        durationSeconds: 0,
        heightM: 20,
        mileageM: 0,
        waypointCount: waypoints.length,
        speedMs: 5,
        waypoints,
      },
    ],
    flightHistory: [],
  };
}

describe("useMissionImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSqlMock.mockResolvedValue({});
  });

  it("retains normalized coordinates without mutating the parsed database", async () => {
    const parsed = parsedMapDb([{ lat: 47.4, lng: 540 }]);
    parseMapDbMock.mockReturnValue(parsed);
    const onImportSuccess = vi.fn();
    const onEditingIdClear = vi.fn();
    const { result } = renderHook(() => useMissionImport({ onImportSuccess, onEditingIdClear }));

    await act(async () => result.current.onImportFile(importEvent()));

    expect(result.current.imported?.records[0].waypoints[0]).toEqual({ lat: 47.4, lng: -180 });
    expect(parsed.records[0].waypoints[0]).toEqual({ lat: 47.4, lng: 540 });
    expect(result.current.importName).toBe("route");
    expect(onEditingIdClear).toHaveBeenCalledOnce();
    expect(onImportSuccess).toHaveBeenCalledOnce();
  });

  it("rejects the complete import when any coordinate is invalid", async () => {
    parseMapDbMock.mockReturnValue(parsedMapDb([{ lat: 47.4, lng: NaN }]));
    const onImportSuccess = vi.fn();
    const { result } = renderHook(() =>
      useMissionImport({ onImportSuccess, onEditingIdClear: vi.fn() }),
    );

    await act(async () => result.current.onImportFile(importEvent()));

    expect(result.current.imported).toBeNull();
    expect(result.current.importErr).toContain("invalid coordinates");
    expect(onImportSuccess).not.toHaveBeenCalled();
  });

  it("rejects metadata outside the persisted mission domain", async () => {
    const parsed = parsedMapDb([{ lat: 47.4, lng: 9.3 }]);
    parsed.records[0].heightM = 10_001;
    parseMapDbMock.mockReturnValue(parsed);
    const { result } = renderHook(() =>
      useMissionImport({ onImportSuccess: vi.fn(), onEditingIdClear: vi.fn() }),
    );

    await act(async () => result.current.onImportFile(importEvent()));

    expect(result.current.imported).toBeNull();
    expect(result.current.importErr).toContain("invalid height or speed");
  });

  it("rejects oversized records before they can enter editor state", async () => {
    parseMapDbMock.mockReturnValue(
      parsedMapDb(
        Array.from({ length: DEFAULT_MAP_DB_PARSE_LIMITS.maxWaypointsPerRecord + 1 }, () => ({
          lat: 47.4,
          lng: 9.3,
        })),
      ),
    );
    const { result } = renderHook(() =>
      useMissionImport({ onImportSuccess: vi.fn(), onEditingIdClear: vi.fn() }),
    );

    await act(async () => result.current.onImportFile(importEvent()));

    expect(result.current.imported).toBeNull();
    expect(result.current.importErr).toContain("too many waypoints");
  });

  it("rejects oversized files before reading them", async () => {
    const { result } = renderHook(() =>
      useMissionImport({ onImportSuccess: vi.fn(), onEditingIdClear: vi.fn() }),
    );

    await act(async () => result.current.onImportFile(importEvent("large.db", 21 * 1024 * 1024)));

    expect(result.current.importErr).toContain("too large");
    expect(loadSqlMock).not.toHaveBeenCalled();
  });

  it("rejects databases with excessive flight records", async () => {
    const parsed = parsedMapDb([]);
    parsed.records = Array.from(
      { length: DEFAULT_MAP_DB_PARSE_LIMITS.maxRecords + 1 },
      (_, index) => ({ ...parsed.records[0], id: index }),
    );
    parseMapDbMock.mockReturnValue(parsed);
    const { result } = renderHook(() =>
      useMissionImport({ onImportSuccess: vi.fn(), onEditingIdClear: vi.fn() }),
    );

    await act(async () => result.current.onImportFile(importEvent()));

    expect(result.current.importErr).toContain("too many flight records");
  });
});
