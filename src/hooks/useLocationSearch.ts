import { useState } from "react";
import { formatSwissAddress, type NominatimAddress } from "../features/geo/formatAddress";
import type { Waypoint } from "../features/mission/missionTypes";

export interface UseLocationSearchReturn {
  geoQuery: string;
  setGeoQuery: (q: string) => void;
  geoBusy: boolean;
  geoErr: string | null;
  setGeoErr: (e: string | null) => void;
  geoResult: string | null;
  setGeoResult: (r: string | null) => void;
  flyCenter: Waypoint | null;
  flySignal: number;
  geoLocBusy: boolean;
  geoLocErr: string | null;
  searchLocation: () => Promise<void>;
  useMyLocation: () => void;
}

export function useLocationSearch(options: {
  onResult: (lat: number, lng: number) => void;
}): UseLocationSearchReturn {
  const [geoQuery, setGeoQuery] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [geoResult, setGeoResult] = useState<string | null>(null);
  const [flyCenter, setFlyCenter] = useState<Waypoint | null>(null);
  const [flySignal, setFlySignal] = useState(0);
  const [geoLocBusy, setGeoLocBusy] = useState(false);
  const [geoLocErr, setGeoLocErr] = useState<string | null>(null);

  const applyResult = (lat: number, lng: number) => {
    setFlyCenter({ lat, lng });
    setFlySignal((n) => n + 1);
    options.onResult(lat, lng);
  };

  const searchLocation = async () => {
    const q = geoQuery.trim();
    if (!q) return;
    setGeoBusy(true);
    setGeoErr(null);
    setGeoResult(null);
    setGeoLocErr(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data: unknown = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setGeoErr('No match — try adding a country, e.g. "… Switzerland".');
        return;
      }
      const hit = data[0] as {
        lat: string;
        lon: string;
        display_name?: string;
        address?: NominatimAddress;
      };
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setGeoErr("Invalid coordinates returned.");
        return;
      }
      applyResult(lat, lng);
      const swiss = formatSwissAddress(hit.address);
      setGeoResult(swiss ?? hit.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } catch {
      setGeoErr("Location search failed (check network).");
    } finally {
      setGeoBusy(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoLocErr("Geolocation is not supported by this browser.");
      return;
    }
    setGeoLocBusy(true);
    setGeoLocErr(null);
    setGeoErr(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        applyResult(coords.latitude, coords.longitude);
        setGeoLocBusy(false);
      },
      () => {
        setGeoLocErr("Could not get location — check browser permission.");
        setGeoLocBusy(false);
      },
      { timeout: 8000, maximumAge: 30000 },
    );
  };

  return {
    geoQuery,
    setGeoQuery,
    geoBusy,
    geoErr,
    setGeoErr,
    geoResult,
    setGeoResult,
    flyCenter,
    flySignal,
    geoLocBusy,
    geoLocErr,
    searchLocation,
    useMyLocation,
  };
}
