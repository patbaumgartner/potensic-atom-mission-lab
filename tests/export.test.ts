// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  downloadBytes,
  downloadText,
  waypointsToGeoJSON,
} from "../src/features/export";

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
  it("downloadBytes creates a blob URL and clicks an anchor", () => {
    URL.createObjectURL = vi.fn(() => "blob:bytes");
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    downloadBytes(new Uint8Array([1, 2, 3]), "test.db");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("downloadText creates a blob URL and clicks an anchor", () => {
    URL.createObjectURL = vi.fn(() => "blob:text");
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    downloadText("hello world", "a.txt");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});
