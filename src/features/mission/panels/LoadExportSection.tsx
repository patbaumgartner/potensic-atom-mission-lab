import type { ChangeEvent } from "react";
import { fmtDuration } from "../format";
import { ATOM_LIMITS } from "../missionTypes";
import type { UseMissionImportReturn } from "../../../hooks/useMissionImport";

export function LoadExportSection({
  missionImport,
  isImported,
  bumpFit,
  busy,
  exportDisabled,
  libraryCount,
  waypointsEmpty,
  onExportMapDb,
  onExportGeoJSON,
  onExportChecklist,
  onExportProject,
  onImportProject,
}: {
  missionImport: UseMissionImportReturn;
  isImported: boolean;
  bumpFit: () => void;
  busy: boolean;
  exportDisabled: boolean;
  libraryCount: number;
  waypointsEmpty: boolean;
  onExportMapDb: () => void;
  onExportGeoJSON: () => void;
  onExportChecklist: () => void;
  onExportProject: () => void;
  onImportProject: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const {
    imported,
    importIndex,
    importName,
    importErr,
    setImportIndex,
    clearImport,
    onImportFile,
  } = missionImport;
  return (
    <>
      <section>
        <h2>Load map.db</h2>
        <label className="filebtn">
          <input
            type="file"
            accept=".db,application/octet-stream,application/x-sqlite3"
            onChange={(e) => void onImportFile(e)}
            hidden
          />
          Import map.db…
        </label>
        {importErr && <p className="err-line">{importErr}</p>}
        {isImported && (
          <div className="import-panel">
            <p className="hint">
              Viewing <strong>{importName}</strong> · {imported?.records.length ?? 0} record(s) ·
              read-only
            </p>
            <div className="record-list">
              {imported?.records.map((r, i) => (
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
            <button className="ghost" onClick={() => clearImport(bumpFit)}>
              Clear import
            </button>
          </div>
        )}
        {imported && imported.flightHistory.length > 0 && (
          <div className="import-panel">
            <p className="hint">Flight history ({imported.flightHistory.length} logged)</p>
            <ul className="flight-history-list">
              {imported.flightHistory.map((f) => (
                <li key={f.id}>
                  <span className="flight-history-when">
                    {new Date(f.startedAtMs).toLocaleString()}
                  </span>
                  <span className="flight-history-stats">
                    {fmtDuration(f.durationMs / 1000)} · {f.distanceM.toFixed(0)} m ·{" "}
                    {f.speedMs.toFixed(1)} m/s
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="exports">
        <button className="primary" disabled={busy || exportDisabled} onClick={onExportMapDb}>
          {busy
            ? "Generating…"
            : libraryCount > 0
              ? `Export map.db (${libraryCount} missions)`
              : "Export map.db"}
        </button>
        <button disabled={waypointsEmpty} onClick={onExportGeoJSON}>
          Export GeoJSON
        </button>
        <button disabled={waypointsEmpty} onClick={onExportChecklist}>
          Field checklist
        </button>
        <button onClick={onExportProject}>Export project…</button>
        <label className="filebtn">
          <input type="file" accept=".json,application/json" onChange={onImportProject} hidden />
          Import project…
        </label>
      </section>

      <p className="hint">
        Max {ATOM_LIMITS.maxWaypointsPerRecord} waypoints per record; larger missions auto-chunk.
        Transfer with <code>debug-clone-tools/push-mapdb-to-clone.sh</code>.
      </p>
    </>
  );
}
