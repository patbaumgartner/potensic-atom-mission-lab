// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTrackAnalysis } from "../src/hooks/useTrackAnalysis";
import { MAX_TRACK_FILE_BYTES } from "../src/features/logs/trackImport";
import type { Waypoint } from "../src/features/mission/missionTypes";

const ORIGIN: Waypoint = { lat: 47.415, lng: 9.395 };
const NEARBY: Waypoint = { lat: 47.416, lng: 9.396 };

describe("useTrackAnalysis", () => {
  it("starts with null actual and no error", () => {
    const { result } = renderHook(() => useTrackAnalysis([ORIGIN, NEARBY]));
    expect(result.current.actual).toBeNull();
    expect(result.current.actualErr).toBeNull();
    expect(result.current.actualLenM).toBe(0);
    expect(result.current.deviation).toBeNull();
  });

  it("clearTrack resets actual to null", async () => {
    const { result } = renderHook(() => useTrackAnalysis([ORIGIN, NEARBY]));
    let bumpCalled = false;
    // Inject a track directly by calling the track file import with a GeoJSON blob
    const geojson = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [9.395, 47.415],
              [9.396, 47.416],
            ],
          },
          properties: {},
        },
      ],
    });
    const file = new File([geojson], "track.geojson", { type: "application/json" });
    const input = {
      target: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.onImportTrack(input);
    });

    expect(result.current.actual).not.toBeNull();

    act(() =>
      result.current.clearTrack(() => {
        bumpCalled = true;
      }),
    );
    expect(result.current.actual).toBeNull();
    expect(bumpCalled).toBe(true);
  });

  it("sets actualErr for empty track file", async () => {
    const { result } = renderHook(() => useTrackAnalysis([]));
    const geojson = JSON.stringify({
      type: "FeatureCollection",
      features: [],
    });
    const file = new File([geojson], "empty.geojson", { type: "application/json" });
    const input = {
      target: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.onImportTrack(input);
    });
    expect(result.current.actualErr).not.toBeNull();
    expect(result.current.actual).toBeNull();
  });

  it("does nothing when no file is selected", async () => {
    const { result } = renderHook(() => useTrackAnalysis([]));
    const input = {
      target: { files: null, value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    await act(async () => {
      await result.current.onImportTrack(input);
    });
    expect(result.current.actual).toBeNull();
    expect(result.current.actualErr).toBeNull();
  });

  it("sets actualErr when file content cannot be parsed as a track", async () => {
    const { result } = renderHook(() => useTrackAnalysis([]));
    const file = new File(["not valid track data @@@@"], "bad.gpx", { type: "text/plain" });
    const input = {
      target: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    await act(async () => {
      await result.current.onImportTrack(input);
    });
    expect(result.current.actualErr).not.toBeNull();
    expect(result.current.actual).toBeNull();
  });

  it("sets actualErr when file.text() rejects", async () => {
    const { result } = renderHook(() => useTrackAnalysis([]));
    const badFile = { text: () => Promise.reject(new Error("read error")) } as unknown as File;
    const input = {
      target: { files: [badFile], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    await act(async () => {
      await result.current.onImportTrack(input);
    });
    expect(result.current.actualErr).toBe("Could not parse that track file.");
    expect(result.current.actual).toBeNull();
  });

  it("rejects oversized track files before reading them", async () => {
    const { result } = renderHook(() => useTrackAnalysis([]));
    const text = vi.fn(() => Promise.resolve("47.4,9.4"));
    const file = { size: MAX_TRACK_FILE_BYTES + 1, text } as unknown as File;
    const input = {
      target: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => result.current.onImportTrack(input));

    expect(text).not.toHaveBeenCalled();
    expect(result.current.actualErr).toContain("too large");
  });
});
