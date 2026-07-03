// Small shared display-formatting helpers for mission/flight data.

/** Format a duration in seconds as "m:ss". */
export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
