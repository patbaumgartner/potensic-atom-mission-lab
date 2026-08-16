// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_LOCATION_RESPONSE_BYTES, useLocationSearch } from "../src/hooks/useLocationSearch";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, ...init });
}

describe("useLocationSearch", () => {
  it("applies a bounded successful Nominatim result", async () => {
    const onResult = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        response(
          JSON.stringify([
            {
              lat: "47.4",
              lon: "9.3",
              display_name: "Example",
              address: { road: "Main Street", house_number: "1", postcode: "9000", city: "City" },
            },
          ]),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLocationSearch({ onResult }));

    act(() => result.current.setGeoQuery("Example"));
    await act(async () => result.current.searchLocation());

    expect(onResult).toHaveBeenCalledWith(47.4, 9.3);
    expect(result.current.flyCenter).toEqual({ lat: 47.4, lng: 9.3 });
    expect(result.current.geoResult).toContain("Main Street");
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects oversized and invalid service responses", async () => {
    const onResult = vi.fn();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        response("[]", { headers: { "content-length": String(MAX_LOCATION_RESPONSE_BYTES + 1) } }),
      )
      .mockResolvedValueOnce(response(JSON.stringify([{ lat: "91", lon: "9" }])));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLocationSearch({ onResult }));

    act(() => result.current.setGeoQuery("Large"));
    await act(async () => result.current.searchLocation());
    expect(result.current.geoErr).toContain("too much data");

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1_001);
    act(() => result.current.setGeoQuery("Invalid"));
    await act(async () => result.current.searchLocation());
    expect(result.current.geoErr).toBe("Invalid coordinates returned.");
    expect(onResult).not.toHaveBeenCalled();
  });

  it("rate-limits repeated searches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response("[]"))),
    );
    const { result } = renderHook(() => useLocationSearch({ onResult: vi.fn() }));
    act(() => result.current.setGeoQuery("One"));
    await act(async () => result.current.searchLocation());
    await act(async () => result.current.searchLocation());
    expect(result.current.geoErr).toContain("wait a moment");
  });

  it("reports permission guidance for failed geolocation", () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) =>
      error({} as GeolocationPositionError),
    );
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: { getCurrentPosition },
    });
    const { result } = renderHook(() => useLocationSearch({ onResult: vi.fn() }));
    act(() => result.current.useMyLocation());
    expect(result.current.geoLocErr).toContain("browser settings");
  });
});
