import type { FormParams } from "../formBuilder";

export function PositionSection({
  params,
  set,
  commit,
  bumpFit,
}: {
  params: FormParams;
  set: (patch: Partial<FormParams>) => void;
  commit: () => void;
  bumpFit: () => void;
}) {
  return (
    <section>
      <h2>Position &amp; orientation</h2>
      <div className="grid2">
        <label>
          Center lat
          <input
            type="number"
            step={0.0001}
            value={params.center.lat}
            onChange={(e) => set({ center: { ...params.center, lat: +e.target.value } })}
          />
        </label>
        <label>
          Center lng
          <input
            type="number"
            step={0.0001}
            value={params.center.lng}
            onChange={(e) => set({ center: { ...params.center, lng: +e.target.value } })}
          />
        </label>
      </div>
      <label className="slider">
        <span>
          Rotate <strong>{Math.round(params.headingDeg)}°</strong>
        </span>
        <input
          type="range"
          min={0}
          max={359}
          value={params.headingDeg}
          onPointerDown={commit}
          onChange={(e) => set({ headingDeg: +e.target.value })}
        />
      </label>
      <button className="ghost" onClick={bumpFit}>
        Fit map to mission
      </button>
      <p className="hint">
        Tip: search an address above, click the map to move the center, or drag the amber handle to
        resize the form live.
      </p>
    </section>
  );
}
