import { useState } from "react";
import { isValidWaypoint } from "../features/mission/useMissionLibrary";
import { parseMapDb, type ParsedMapDb } from "../features/potensic/atomMapDb";
import { loadSql } from "../features/potensic/sqlLoader";

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
      const bytes = new Uint8Array(await file.arrayBuffer());
      const SQL = await loadSql();
      const parsed = parseMapDb(SQL, bytes);
      // Validate every waypoint has finite coordinates.
      const allValid = parsed.records.every((r) => r.waypoints.every((w) => isValidWaypoint(w)));
      if (!allValid) {
        setImportErr("map.db contains invalid coordinates — file may be corrupt.");
        return;
      }
      setImported(parsed);
      setImportIndex(0);
      setImportName(file.name.replace(/\.[^.]+$/, ""));
      options.onEditingIdClear();
      if (parsed.records.length === 0) {
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
