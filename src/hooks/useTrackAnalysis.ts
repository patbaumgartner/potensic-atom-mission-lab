import { useMemo, useState } from "react";
import { pathDeviation, pathLengthMeters } from "../features/mission/geometry";
import { parseTrack, type ImportedTrack } from "../features/logs/trackImport";
import type { Waypoint } from "../features/mission/missionTypes";

export interface UseTrackAnalysisReturn {
  actual: ImportedTrack | null;
  actualErr: string | null;
  deviation: ReturnType<typeof pathDeviation> | null;
  actualLenM: number;
  onImportTrack: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  clearTrack: (bumpFit: () => void) => void;
}

export function useTrackAnalysis(plannedWaypoints: Waypoint[]): UseTrackAnalysisReturn {
  const [actual, setActual] = useState<ImportedTrack | null>(null);
  const [actualErr, setActualErr] = useState<string | null>(null);

  const deviation = useMemo(
    () => (actual ? pathDeviation(actual.points, plannedWaypoints) : null),
    [actual, plannedWaypoints],
  );
  const actualLenM = useMemo(() => (actual ? pathLengthMeters(actual.points) : 0), [actual]);

  const onImportTrack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActualErr(null);
    try {
      const text = await file.text();
      const track = parseTrack(text, file.name);
      if (track.points.length === 0) {
        setActualErr("No coordinates found in that track file.");
        setActual(null);
      } else {
        setActual(track);
      }
    } catch {
      setActualErr("Could not parse that track file.");
      setActual(null);
    } finally {
      e.target.value = "";
    }
  };

  const clearTrack = (bumpFit: () => void) => {
    setActual(null);
    bumpFit();
  };

  return { actual, actualErr, deviation, actualLenM, onImportTrack, clearTrack };
}
