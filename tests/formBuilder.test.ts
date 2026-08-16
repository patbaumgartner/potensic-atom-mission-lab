import { describe, expect, it } from "vitest";
import { buildForm, DEFAULT_FORM_PARAMS, type FormKind } from "../src/features/mission/formBuilder";

const kinds: FormKind[] = ["line", "polygon", "circle", "grid", "spiral", "star", "cinematic"];

describe("buildForm", () => {
  it.each(kinds)("builds non-empty finite waypoints for %s", (kind) => {
    const wps = buildForm({ ...DEFAULT_FORM_PARAMS, kind });
    expect(wps.length).toBeGreaterThan(0);
    for (const w of wps) {
      expect(Number.isFinite(w.lat)).toBe(true);
      expect(Number.isFinite(w.lng)).toBe(true);
    }
  });

  it("manual returns a copy of the provided points", () => {
    const manual = [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ];
    const wps = buildForm({ ...DEFAULT_FORM_PARAMS, kind: "manual", manual });
    expect(wps).toEqual(manual);
    expect(wps).not.toBe(manual);
  });

  it("manual with no points returns empty", () => {
    expect(buildForm({ ...DEFAULT_FORM_PARAMS, kind: "manual", manual: [] })).toEqual([]);
  });

  it("returns empty for an unknown kind", () => {
    expect(buildForm({ ...DEFAULT_FORM_PARAMS, kind: "bogus" as FormKind })).toEqual([]);
  });

  it("line respects heading and length via the end point", () => {
    const wps = buildForm({
      ...DEFAULT_FORM_PARAMS,
      kind: "line",
      lengthM: 120,
      spacingM: 30,
    });
    expect(wps.length).toBeGreaterThanOrEqual(4);
  });

  it("cinematic shot mode builds the selected two-point view", () => {
    const first = buildForm({
      ...DEFAULT_FORM_PARAMS,
      kind: "cinematic",
      cinematicMode: "shots",
      cinematicViewIndex: 0,
    });
    const last = buildForm({
      ...DEFAULT_FORM_PARAMS,
      kind: "cinematic",
      cinematicMode: "shots",
      cinematicViewIndex: 99,
    });
    expect(first).toHaveLength(2);
    expect(last).toHaveLength(2);
    expect(last).not.toEqual(first);
  });

  it("cinematic route mode builds a connected repositioning route", () => {
    const waypoints = buildForm({
      ...DEFAULT_FORM_PARAMS,
      kind: "cinematic",
      cinematicMode: "route",
    });
    expect(waypoints.length).toBeGreaterThan(16);
  });
});
