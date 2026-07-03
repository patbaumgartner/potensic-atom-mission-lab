// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseTrack } from "../src/features/logs/trackImport";

describe("track import", () => {
  it("parses a GPX track with trkpt/rtept/wpt", () => {
    const gpx =
      '<gpx><trk><trkseg><trkpt lat="47.4" lon="9.4"/><trkpt lat="47.41" lon="9.41"/></trkseg></trk>' +
      '<rte><rtept lat="47.42" lon="9.42"/></rte><wpt lat="47.43" lon="9.43"/></gpx>';
    expect(parseTrack(gpx, "a.gpx").points).toHaveLength(4);
  });

  it("parses a GeoJSON LineString Feature", () => {
    const geo = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [9.4, 47.4],
              [9.41, 47.41],
              [9.42, 47.42],
            ],
          },
        },
      ],
    });
    const t = parseTrack(geo, "flight.geojson");
    expect(t.points).toHaveLength(3);
    expect(t.points[0]).toEqual({ lat: 47.4, lng: 9.4 });
    expect(t.name).toBe("flight");
  });

  it("parses a bare GeoJSON geometry", () => {
    const geo = JSON.stringify({
      type: "LineString",
      coordinates: [
        [9.4, 47.4],
        [9.41, 47.41],
      ],
    });
    expect(parseTrack(geo, "x.json").points).toHaveLength(2);
  });

  it("parses MultiLineString and Polygon", () => {
    const mls = parseTrack(
      JSON.stringify({
        type: "Feature",
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [9.4, 47.4],
              [9.41, 47.41],
            ],
            [[9.42, 47.42]],
          ],
        },
      }),
      "m.json",
    );
    expect(mls.points).toHaveLength(3);
    const poly = parseTrack(
      JSON.stringify({
        type: "Polygon",
        coordinates: [
          [
            [9.4, 47.4],
            [9.41, 47.41],
            [9.42, 47.42],
          ],
        ],
      }),
      "p.json",
    );
    expect(poly.points).toHaveLength(3);
  });

  it("parses Point and MultiPoint", () => {
    expect(
      parseTrack(JSON.stringify({ type: "Point", coordinates: [9.4, 47.4] }), "pt.json").points,
    ).toHaveLength(1);
    expect(
      parseTrack(
        JSON.stringify({
          type: "MultiPoint",
          coordinates: [
            [9.4, 47.4],
            [9.41, 47.41],
          ],
        }),
        "mp.json",
      ).points,
    ).toHaveLength(2);
  });

  it("returns empty for an unknown geometry type", () => {
    expect(
      parseTrack(JSON.stringify({ type: "GeometryCollection", geometries: [] }), "u.json").points,
    ).toHaveLength(0);
  });

  it("parses CSV with lat/lng headers", () => {
    const csv = "lat,lng\n47.4,9.4\n47.41,9.41\n";
    const t = parseTrack(csv, "log.csv");
    expect(t.points).toHaveLength(2);
    expect(t.points[1]).toEqual({ lat: 47.41, lng: 9.41 });
  });

  it("parses CSV with semicolon delimiters", () => {
    expect(parseTrack("lat;lng\n47.4;9.4\n47.41;9.41", "b.csv").points).toHaveLength(2);
  });

  it("parses headerless CSV as lat,lng", () => {
    const csv = "47.4,9.4\n47.41,9.41\n47.42,9.42";
    expect(parseTrack(csv, "log.csv").points).toHaveLength(3);
  });

  it("skips malformed rows", () => {
    const csv = "lat,lng\n47.4,9.4\nbad,row\n47.42,9.42";
    expect(parseTrack(csv, "log.csv").points).toHaveLength(2);
  });

  it("derives the name from the filename", () => {
    expect(parseTrack("47.4,9.4", "my.flight.csv").name).toBe("my.flight");
  });

  it("skips GPX points with invalid coordinates", () => {
    const gpx = '<gpx><trkpt lat="47.4" lon="9.4"/><trkpt lat="bad"/></gpx>';
    expect(parseTrack(gpx, "a.gpx").points).toHaveLength(1);
  });

  it("skips GPX points missing an attribute", () => {
    const gpx = '<gpx><trkpt lon="9.4"/><trkpt lat="47.4" lon="9.4"/></gpx>';
    expect(parseTrack(gpx, "a.gpx").points).toHaveLength(1);
  });

  it("skips length-2 coordinate pairs with non-numeric values", () => {
    const geo = JSON.stringify({
      type: "LineString",
      coordinates: [
        ["a", "b"],
        [9.4, 47.4],
      ],
    });
    expect(parseTrack(geo, "a.json").points).toHaveLength(1);
  });

  it("returns empty for whitespace-only CSV", () => {
    expect(parseTrack("   \n  ", "a.csv").points).toHaveLength(0);
  });

  it("ignores a geometry whose coordinates are not an array", () => {
    const geo = JSON.stringify({ type: "LineString", coordinates: "nope" });
    expect(parseTrack(geo, "a.json").points).toHaveLength(0);
  });

  it("ignores features with null geometry", () => {
    const geo = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: null },
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [9.4, 47.4],
              [9.41, 47.41],
            ],
          },
        },
      ],
    });
    expect(parseTrack(geo, "a.json").points).toHaveLength(2);
  });

  it("ignores non-array or short coordinate entries", () => {
    const geo = JSON.stringify({
      type: "LineString",
      coordinates: [[9.4, 47.4], "bad", [9.41]],
    });
    expect(parseTrack(geo, "a.json").points).toHaveLength(1);
  });
});
