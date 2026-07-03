// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/unbound-method -- test mocking patterns */
import { describe, expect, it, vi } from "vitest";
import {
  buildChecklist,
  downloadBytes,
  downloadText,
  exportProjectJSON,
  waypointsToGeoJSON,
} from "../src/features/export";

describe("exportProjectJSON", () => {
  it("serialises library and workspace into valid JSON with an exportedAt timestamp", () => {
    const lib = [{ id: "1", name: "m" }];
    const ws = { v: 1, name: "Mission" };
    const json = JSON.parse(exportProjectJSON({ library: lib, workspace: ws }));
    expect(json.library).toEqual(lib);
    expect(json.workspace).toEqual(ws);
    expect(typeof json.exportedAt).toBe("string");
  });
});

describe("waypointsToGeoJSON", () => {
  it("produces a FeatureCollection with a LineString in lng/lat order", () => {
    const gj = JSON.parse(
      waypointsToGeoJSON("m", [
        { lat: 47.4, lng: 9.4 },
        { lat: 47.41, lng: 9.41 },
      ]),
    );
    expect(gj.type).toBe("FeatureCollection");
    expect(gj.features[0].geometry.type).toBe("LineString");
    expect(gj.features[0].geometry.coordinates[0]).toEqual([9.4, 47.4]);
    expect(
      gj.features.filter((f: { geometry: { type: string } }) => f.geometry.type === "Point"),
    ).toHaveLength(2);
  });
});

describe("downloads", () => {
  it("downloadBytes creates a blob URL, clicks an anchor, and revokes the URL", () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:bytes");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadBytes(new Uint8Array([1, 2, 3]), "test.db");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    vi.runAllTimers(); // run the deferred URL.revokeObjectURL cleanup
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:bytes");
    click.mockRestore();
    vi.useRealTimers();
  });

  it("downloadText creates a blob URL and clicks an anchor", () => {
    URL.createObjectURL = vi.fn(() => "blob:text");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadText("hello world", "a.txt");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});

describe("buildChecklist", () => {
  it("renders mission name, waypoint/chunk counts, distance, and planned height/speed", () => {
    const md = buildChecklist(
      { name: "Survey", waypoints: [{ lat: 0, lng: 0 }], plannedHeightM: 20, plannedSpeedMs: 5 },
      123,
      2,
    );
    expect(md).toContain("# Field checklist — Survey");
    expect(md).toContain("Waypoints: 1 (2 chunk(s))");
    expect(md).toContain("Path distance: 123 m");
    expect(md).toContain("Planned height: 20 m");
    expect(md).toContain("Planned speed: 5 m/s");
  });
});
