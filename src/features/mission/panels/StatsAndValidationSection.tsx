import { StatCard } from "../../../components/StatCard";
import type { ValidationIssue } from "../missionTypes";

export function StatsAndValidationSection({
  waypointCount,
  distanceM,
  durationFmt,
  enduranceFrac,
  maxHomeM,
  chunkCount,
  headingLabel,
  issues,
  geofenceBreached,
  geofenceM,
  usableMin,
}: {
  waypointCount: number;
  distanceM: number;
  durationFmt: string;
  enduranceFrac: number;
  maxHomeM: number;
  chunkCount: number;
  headingLabel: string;
  issues: ValidationIssue[];
  geofenceBreached: boolean;
  geofenceM: number;
  usableMin: number;
}) {
  return (
    <>
      <section className="stats">
        <StatCard icon="pin" label="Waypoints" value={String(waypointCount)} />
        <StatCard icon="ruler" label="Distance" value={`${distanceM.toFixed(0)} m`} />
        <StatCard icon="clock" label="Est. time" value={durationFmt} />
        <StatCard icon="battery" label="Battery" value={`${Math.round(enduranceFrac * 100)}%`} />
        <StatCard icon="home" label="Max home" value={`${maxHomeM.toFixed(0)} m`} />
        <StatCard icon="layers" label="Chunks" value={String(chunkCount)} />
        <StatCard icon="compass" label="Heading" value={headingLabel} />
      </section>

      <section>
        <h2>Validation</h2>
        <ul className="issues">
          {issues.map((it, i) => (
            <li key={i} className={it.level}>
              {it.message}
            </li>
          ))}
          {enduranceFrac > 1 && (
            <li className="error">
              Flight time {durationFmt} exceeds usable battery (~{usableMin.toFixed(0)} min).
              Shorten the mission.
            </li>
          )}
          {enduranceFrac > 0.85 && enduranceFrac <= 1 && (
            <li className="warning">
              Flight uses {Math.round(enduranceFrac * 100)}% of usable battery — little margin for
              wind/RTH.
            </li>
          )}
          {geofenceBreached && (
            <li className="warning">
              Max distance from home {maxHomeM.toFixed(0)} m exceeds geofence {geofenceM} m.
            </li>
          )}
          {issues.length === 0 && enduranceFrac <= 0.85 && !geofenceBreached && (
            <li className="info">No issues.</li>
          )}
        </ul>
      </section>
    </>
  );
}
