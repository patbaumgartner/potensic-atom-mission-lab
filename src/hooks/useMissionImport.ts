import { useState } from "react";
import { parseWaypoint } from "../features/mission/missionSchema";
import { ATOM_LIMITS } from "../features/mission/missionTypes";
import {
  DEFAULT_MAP_DB_PARSE_LIMITS,
  parseMapDb,
  type ParsedMapDb,
} from "../features/potensic/atomMapDb";
import { loadSql } from "../features/potensic/sqlLoader";

const MAX_MAP_DB_FILE_BYTES = 20 * 1024 * 1024;

export interface UseMissionImportReturn {
  imported: ParsedMapDb | null;
  importIndex: number;
  importName: string;
  importErr: string | null;
  setImported: (v: ParsedMapDb | null) => void;
  setImportIndex: (i: number) => void;
  setImportName: (n: string) => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  clearImport: (bumpFit: () => void) => void;
}

export function useMissionImport(options: {
  onImportSuccess: () => void;
  onEditingIdClear: () => void;
}): UseMissionImportReturn {
  const [imported, setImported] = useState<ParsedMapDb | null>(null);
  const [importIndex, setImportIndex] = useState(0);
  const [importName, setImportName] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportErr(null);
    try {
      if (file.size > MAX_MAP_DB_FILE_BYTES) {
        setImportErr("That map.db is too large to import safely.");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const SQL = await loadSql();
      const parsed = parseMapDb(SQL, bytes);
      if (parsed.records.length > DEFAULT_MAP_DB_PARSE_LIMITS.maxRecords) {
        setImportErr("map.db contains too many flight records.");
        return;
      }
      const records = [];
      let totalWaypoints = 0;
      for (const record of parsed.records) {
        if (
          !Number.isFinite(record.heightM) ||
          record.heightM < 0 ||
          record.heightM > ATOM_LIMITS.maxPlannedHeightM ||
          !Number.isFinite(record.speedMs) ||
          record.speedMs < 0 ||
          record.speedMs > ATOM_LIMITS.maxPlannedSpeedMs
        ) {
          setImportErr("map.db contains invalid height or speed metadata.");
          return;
        }
        if (record.waypoints.length > DEFAULT_MAP_DB_PARSE_LIMITS.maxWaypointsPerRecord) {
          setImportErr("map.db contains too many waypoints in one flight record.");
          return;
        }
        totalWaypoints += record.waypoints.length;
        if (totalWaypoints > DEFAULT_MAP_DB_PARSE_LIMITS.maxTotalWaypoints) {
          setImportErr("map.db contains too many waypoints.");
          return;
        }
        const waypoints = [];
        for (const value of record.waypoints) {
          const waypoint = parseWaypoint(value);
          if (!waypoint) {
            setImportErr("map.db contains invalid coordinates — file may be corrupt.");
            return;
          }
          waypoints.push(waypoint);
        }
        records.push({ ...record, waypoints });
      }
      const normalized = { ...parsed, records };
      setImported(normalized);
      setImportIndex(0);
      setImportName(file.name.replace(/\.[^.]+$/, ""));
      options.onEditingIdClear();
      if (normalized.records.length === 0) {
        setImportErr("No flight records found in this map.db.");
      }
      options.onImportSuccess();
    } catch {
      setImportErr("Could not read this file as a map.db.");
      setImported(null);
    } finally {
      e.target.value = "";
    }
  };

  const clearImport = (bumpFit: () => void) => {
    setImported(null);
    bumpFit();
  };

  return {
    imported,
    importIndex,
    importName,
    importErr,
    setImported,
    setImportIndex,
    setImportName,
    onImportFile,
    clearImport,
  };
}
