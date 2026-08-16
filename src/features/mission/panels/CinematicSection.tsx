import {
  CINEMATIC_PATTERN_LABELS,
  cinematicPatternViewCount,
  type CinematicPattern,
  type CinematicPlan,
} from "../cinematic";
import type { FormParams } from "../formBuilder";

export function CinematicSection({
  params,
  plan,
  set,
  commit,
  busy,
  actionMessage,
  onAddShotPack,
  onExportChecklist,
}: {
  params: FormParams;
  plan: CinematicPlan;
  set: (patch: Partial<FormParams>) => void;
  commit: () => void;
  busy: boolean;
  actionMessage: string | null;
  onAddShotPack: () => void;
  onExportChecklist: () => void;
}) {
  const selectedIndex = Math.min(plan.shots.length - 1, params.cinematicViewIndex);
  const selectedShot = plan.shots[selectedIndex];
  const setPattern = (pattern: CinematicPattern) => {
    commit();
    set({
      cinematicPattern: pattern,
      cinematicViewCount: cinematicPatternViewCount(pattern),
      cinematicViewIndex: 0,
    });
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
          Separate clips
        </button>
        <button
          className={params.cinematicMode === "route" ? "active" : ""}
          onClick={() => {
            commit();
            set({ cinematicMode: "route" });
          }}
        >
          Continuous route
        </button>
      </div>

      <label>
        Pattern
        <select
          value={params.cinematicPattern}
          onChange={(event) => setPattern(event.target.value as CinematicPattern)}
        >
          {Object.entries(CINEMATIC_PATTERN_LABELS).map(([pattern, label]) => (
            <option key={pattern} value={pattern}>
              {label}
            </option>
          ))}
        </select>
      </label>

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
          <dt>{params.cinematicMode === "shots" ? "Selected view" : "Route points"}</dt>
          <dd>
            {params.cinematicMode === "shots" ? selectedShot.label : plan.combinedRoute.length}
          </dd>
        </div>
      </dl>

      {plan.gimbal.warning && <p className="err-line">{plan.gimbal.warning}</p>}
      <p className="hint">
        Set yaw, gimbal and recording manually before flight. Trim the lead-in; in continuous-route
        mode, blue outbound and outer transitions are repositioning only.
      </p>

      <div className="cinematic-actions">
        <button className="primary" disabled={busy} onClick={onAddShotPack}>
          {params.cinematicMode === "shots"
            ? `Add all ${plan.shots.length} clips`
            : "Add continuous route"}
        </button>
        <button onClick={onExportChecklist}>Shot checklist</button>
      </div>
      {actionMessage && <p className="hint">{actionMessage}</p>}
    </section>
  );
}
