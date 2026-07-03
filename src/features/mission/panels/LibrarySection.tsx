import type { SavedMission } from "../useMissionLibrary";

export function LibrarySection({
  library,
  editingId,
  waypointsEmpty,
  onAddToLibrary,
  onFitAll,
  onRename,
  onLoad,
  onDuplicate,
  onExportEntry,
  onRemove,
}: {
  library: SavedMission[];
  editingId: string | null;
  waypointsEmpty: boolean;
  onAddToLibrary: () => void;
  onFitAll: () => void;
  onRename: (id: string, name: string) => void;
  onLoad: (e: SavedMission) => void;
  onDuplicate: (id: string) => void;
  onExportEntry: (e: SavedMission) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section>
      <h2>Mission library</h2>
      <button className="ghost" onClick={onAddToLibrary} disabled={waypointsEmpty}>
        + Add current to library
      </button>
      {library.length > 0 && (
        <div className="lib-list">
          <button className="ghost" onClick={onFitAll}>
            ▣ Fit all missions on map
          </button>
          {library.map((e) => (
            <div key={e.id} className={`lib-item ${e.id === editingId ? "editing" : ""}`}>
              <span className="lib-swatch" style={{ background: e.color }} />
              <input
                className="lib-name"
                value={e.name}
                onChange={(ev) => onRename(e.id, ev.target.value)}
              />
              <span className="lib-count">{e.waypoints.length} wp</span>
              <div className="lib-actions">
                <button title="Load for editing" onClick={() => onLoad(e)}>
                  Load
                </button>
                <button title="Duplicate" onClick={() => onDuplicate(e.id)}>
                  ⧉
                </button>
                <button title="Export just this" onClick={() => onExportEntry(e)}>
                  ⭳
                </button>
                <button title="Remove" onClick={() => onRemove(e.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <p className="hint">
            Export writes all {library.length} mission(s) into one <code>map.db</code>, each as its
            own PotensicPro route.
          </p>
        </div>
      )}
    </section>
  );
}
