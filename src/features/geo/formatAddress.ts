// Format an OpenStreetMap/Nominatim address into a concise Swiss-style address,
// e.g. "Lehmernweg 21, 9450 Lüchingen" or "St. Georgen, 9011 St. Gallen".

export interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  hamlet?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  county?: string;
}

/**
 * Build a two-part Swiss address: an optional street/area line and a
 * "PLZ City" line. Returns "" when nothing usable is present.
 */
export function formatSwissAddress(a: NominatimAddress | undefined): string {
  if (!a) return "";
  const street = [a.road ?? a.pedestrian, a.house_number]
    .filter(Boolean)
    .join(" ");
  const area = a.suburb ?? a.neighbourhood ?? a.quarter ?? "";
  const line1 = street || area;
  const city =
    a.city ??
    a.town ??
    a.village ??
    a.municipality ??
    a.hamlet ??
    a.county ??
    "";
  const line2 = [a.postcode, city].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(", ");
}
