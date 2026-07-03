import type { UseTrackAnalysisReturn } from "../../../hooks/useTrackAnalysis";

export function AnalysisSection({
  trackAnalysis,
  distanceM,
  bumpFit,
}: {
  trackAnalysis: UseTrackAnalysisReturn;
  distanceM: number;
  bumpFit: () => void;
}) {
  const { actual, actualErr, deviation, actualLenM, onImportTrack, clearTrack } = trackAnalysis;
  return (
    <section>
      <h2>Analysis</h2>
      <label className="filebtn">
        <input
          type="file"
          accept=".geojson,.json,.gpx,.csv,.kml"
          onChange={(e) => void onImportTrack(e)}
          hidden
        />
        Import flown track (GPX/GeoJSON/CSV)…
      </label>
      {actualErr && <p className="err-line">{actualErr}</p>}
      {actual && (
        <div className="import-panel">
          <p className="hint">
            <span className="legend-dot" /> Actual: <strong>{actual.name}</strong> ·{" "}
            {actual.points.length} pts · {actualLenM.toFixed(0)} m
          </p>
          {deviation && (
            <div className="dev-grid">
              <div>
                <span>Max deviation</span>
                <strong>{deviation.maxM.toFixed(1)} m</strong>
              </div>
              <div>
                <span>Avg deviation</span>
                <strong>{deviation.avgM.toFixed(1)} m</strong>
              </div>
              <div>
                <span>Planned</span>
                <strong>{distanceM.toFixed(0)} m</strong>
              </div>
              <div>
                <span>Actual</span>
                <strong>{actualLenM.toFixed(0)} m</strong>
              </div>
            </div>
          )}
          <button className="ghost" onClick={() => clearTrack(bumpFit)}>
            Clear track
          </button>
        </div>
      )}
    </section>
  );
}
