import { describe, expect, it } from "vitest";
import { formatSwissAddress } from "../src/features/geo/formatAddress";

describe("formatSwissAddress", () => {
  it("formats a full street address", () => {
    expect(
      formatSwissAddress({
        road: "Lehmernweg",
        house_number: "21",
        postcode: "9450",
        village: "Lüchingen",
      }),
    ).toBe("Lehmernweg 21, 9450 Lüchingen");
  });

  it("uses the suburb when there is no street", () => {
    expect(
      formatSwissAddress({
        suburb: "St. Georgen",
        city: "St. Gallen",
        postcode: "9011",
      }),
    ).toBe("St. Georgen, 9011 St. Gallen");
  });

  it("formats a city with postcode only", () => {
    expect(formatSwissAddress({ city: "Genève", postcode: "1204" })).toBe("1204 Genève");
  });

  it("falls back through town/village/municipality/hamlet/county", () => {
    expect(formatSwissAddress({ town: "Altstätten", postcode: "9450" })).toBe("9450 Altstätten");
    expect(formatSwissAddress({ municipality: "Widnau" })).toBe("Widnau");
    expect(formatSwissAddress({ hamlet: "Hinterforst" })).toBe("Hinterforst");
    expect(formatSwissAddress({ county: "Rheintal" })).toBe("Rheintal");
  });

  it("uses pedestrian and neighbourhood/quarter fallbacks", () => {
    expect(
      formatSwissAddress({
        pedestrian: "Marktgasse",
        postcode: "9000",
        city: "St. Gallen",
      }),
    ).toBe("Marktgasse, 9000 St. Gallen");
    expect(formatSwissAddress({ neighbourhood: "Riethüsli" })).toBe("Riethüsli");
    expect(formatSwissAddress({ quarter: "Lachen" })).toBe("Lachen");
  });

  it("returns empty for missing or empty address", () => {
    expect(formatSwissAddress(undefined)).toBe("");
    expect(formatSwissAddress({})).toBe("");
  });
});
