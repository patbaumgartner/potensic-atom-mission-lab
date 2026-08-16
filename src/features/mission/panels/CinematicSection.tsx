import type { CinematicPlan, CinematicViewCount } from "../cinematic";
import type { FormParams } from "../formBuilder";

export function CinematicSection({
  params,
  plan,
  set,
  commit,
  busy,
  actionMessage,
  onAddShotPack,
  onExportShotPack,
  onExportChecklist,
}: {
  params: FormParams;
  plan: CinematicPlan;
  set: (patch: Partial<FormParams>) => void;
  commit: () => void;
  busy: boolean;
  actionMessage: string | null;
  onAddShotPack: () => void;
  onExportShotPack: () => void;
  onExportChecklist: () => void;
}) {
  const selectedIndex = Math.min(plan.shots.length - 1, params.cinematicViewIndex);
  const selectedShot = plan.shots[selectedIndex];
  const setViewCount = (count: CinematicViewCount) => {
    commit();
    set({ cinematicViewCount: count, cinematicViewIndex: 0 });
  };

  return (
    <section className="cinematic-section">
      <h2>Cinematic setup</h2>
      <div className="segmented" aria-label="Cinematic output mode">
        <button
          className={params.cinematicMode === "shots" ? "active" : ""}
          onClick={() => {
            commit();
            set({ cinematicMode: "shots" });
          }}
        >
          Shot pack
        </button>
        <button
          className={params.cinematicMode === "route" ? "active" : ""}
          onClick={() => {
            commit();
            set({ cinematicMode: "route" });
          }}
        >
          Single route
        </button>
      </div>

      <div className="segmented" aria-label="Cinematic view count">
        <button
          className={params.cinematicViewCount === 4 ? "active" : ""}
          onClick={() => setViewCount(4)}
        >
          4 corners
        </button>
        <button
          className={params.cinematicViewCount === 8 ? "active" : ""}
          onClick={() => setViewCount(8)}
        >
          8 views
        </button>
      </div>

      {params.cinematicMode === "shots" && (
        <label>
          Preview view
          <select
            value={selectedIndex}
            onChange={(event) => {
              commit();
              set({ cinematicViewIndex: Number(event.target.value) });
            }}
          >
            {plan.shots.map((shot) => (
              <option key={shot.index} value={shot.index}>
                {shot.index + 1}. {shot.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <dl className="cinematic-readout">
        <div>
          <dt>Closest center distance</dt>
          <dd>{plan.safetyRadiusM.toFixed(1)} m</dd>
        </div>
        <div>
          <dt>Starting distance</dt>
          <dd>{plan.stagingDistanceM.toFixed(1)} m</dd>
        </div>
        <div>
          <dt>Fixed gimbal pitch</dt>
          <dd>{plan.gimbal.pitchDeg.toFixed(0)}°</dd>
        </div>
        <div>
          <dt>Selected view</dt>
          <dd>{params.cinematicMode === "shots" ? selectedShot.label : "All views"}</dd>
        </div>
      </dl>

      {plan.gimbal.warning && <p className="err-line">{plan.gimbal.warning}</p>}
      <p className="hint">
        Set yaw, gimbal and recording manually before flight. Trim the lead-in; in single-route
        mode, blue outbound and outer transitions are repositioning only.
      </p>

      <div className="cinematic-actions">
        <button className="primary" disabled={busy} onClick={onAddShotPack}>
          Add all {plan.shots.length} shots
        </button>
        <button disabled={busy} onClick={onExportShotPack}>
          Export shot pack map.db
        </button>
        <button onClick={onExportChecklist}>Shot checklist</button>
      </div>
      {actionMessage && <p className="hint">{actionMessage}</p>}
    </section>
  );
}
