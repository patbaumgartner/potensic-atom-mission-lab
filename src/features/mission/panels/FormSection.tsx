import { renderParams } from "../paramList";
import type { FormKind, FormParams } from "../formBuilder";

const FORMS: { kind: FormKind; label: string; glyph: string }[] = [
  { kind: "line", label: "Line", glyph: "╱" },
  { kind: "polygon", label: "Polygon", glyph: "⬟" },
  { kind: "circle", label: "Circle", glyph: "◯" },
  { kind: "grid", label: "Grid", glyph: "▦" },
  { kind: "spiral", label: "Spiral", glyph: "◎" },
  { kind: "star", label: "Star", glyph: "★" },
  { kind: "manual", label: "Manual", glyph: "✎" },
];

export function FormSection({
  params,
  set,
  commit,
  canUndo,
  canRedo,
  undo,
  redo,
  onSelectForm,
  isImported,
  editAsPoints,
  reversePoints,
  mirrorAcrossCenter,
  closeLoopPoints,
  removeLastPoint,
}: {
  params: FormParams;
  set: (patch: Partial<FormParams>) => void;
  commit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  onSelectForm: (kind: FormKind) => void;
  isImported: boolean;
  editAsPoints: () => void;
  reversePoints: () => void;
  mirrorAcrossCenter: () => void;
  closeLoopPoints: () => void;
  removeLastPoint: () => void;
}) {
  return (
    <>
      <section>
        <h2>Form</h2>
        <div className="toolbar">
          <button onClick={undo} disabled={!canUndo}>
            ↶ Undo
          </button>
          <button onClick={redo} disabled={!canRedo}>
            ↷ Redo
          </button>
        </div>
        <div className="forms">
          {FORMS.map((f) => (
            <button
              key={f.kind}
              className={`tile ${params.kind === f.kind ? "active" : ""}`}
              onClick={() => onSelectForm(f.kind)}
            >
              <span className="f-glyph">{f.glyph}</span>
              <span className="f-label">{f.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Parameters</h2>
        {params.kind === "manual" ? (
          <div className="manual-controls">
            <p className="hint">
              Click the map to add points, or drag any point to move it ({params.manual.length}).
            </p>
            <div className="btn-row">
              <button onClick={reversePoints} disabled={params.manual.length < 2}>
                Reverse
              </button>
              <button onClick={mirrorAcrossCenter} disabled={params.manual.length < 2}>
                Mirror
              </button>
              <button onClick={closeLoopPoints} disabled={params.manual.length < 3}>
                Close loop
              </button>
            </div>
            <div className="btn-row">
              <button onClick={removeLastPoint} disabled={params.manual.length === 0}>
                Remove last
              </button>
              <button
                onClick={() => {
                  commit();
                  set({ manual: [] });
                }}
                disabled={params.manual.length === 0}
              >
                Clear
              </button>
            </div>
            {params.manual.length > 0 && (
              <details className="wp-table-wrap">
                <summary>
                  Waypoints ({params.manual.length})
                  <button
                    className="wp-table-csv"
                    onClick={(ev) => {
                      ev.preventDefault();
                      const csv =
                        "index,lat,lng\n" +
                        params.manual.map((w, i) => `${i + 1},${w.lat},${w.lng}`).join("\n");
                      void navigator.clipboard?.writeText(csv);
                    }}
                  >
                    Copy CSV
                  </button>
                </summary>
                <div className="wp-table-scroll">
                  <table className="wp-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Lat</th>
                        <th>Lng</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {params.manual.map((w, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>
                            <input
                              type="number"
                              step={0.00001}
                              value={w.lat}
                              onChange={(ev) => {
                                const v = +ev.target.value;
                                if (!Number.isFinite(v)) return;
                                const next = params.manual.slice();
                                next[i] = { ...next[i], lat: v };
                                commit();
                                set({ manual: next });
                              }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step={0.00001}
                              value={w.lng}
                              onChange={(ev) => {
                                const v = +ev.target.value;
                                if (!Number.isFinite(v)) return;
                                const next = params.manual.slice();
                                next[i] = { ...next[i], lng: v };
                                commit();
                                set({ manual: next });
                              }}
                            />
                          </td>
                          <td>
                            <button
                              className="wp-table-del"
                              title="Remove"
                              onClick={() => {
                                commit();
                                set({ manual: params.manual.filter((_, j) => j !== i) });
                              }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        ) : (
          <>
            <div className="params-list">{renderParams(params, set, commit)}</div>
            {!isImported && (
              <button className="ghost" onClick={editAsPoints}>
                ✎ Edit as draggable points
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}
