// Map search bar, drop-center / my-location buttons, and the single toast slot.
import type { UseLocationSearchReturn } from "../../hooks/useLocationSearch";

export function MapToolbar({
  locationSearch,
  dropCenterMode,
  setDropCenterMode,
  isImported,
}: {
  locationSearch: UseLocationSearchReturn;
  dropCenterMode: boolean;
  setDropCenterMode: (updater: (v: boolean) => boolean) => void;
  isImported: boolean;
}) {
  const {
    geoQuery,
    setGeoQuery,
    geoBusy,
    geoErr,
    setGeoErr,
    geoResult,
    setGeoResult,
    geoLocBusy,
    geoLocErr,
    searchLocation,
    useMyLocation,
  } = locationSearch;

  return (
    <>
      <div className="map-search">
        <svg
          className="map-search-ic"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          placeholder="Search location (address or place)…"
          value={geoQuery}
          onChange={(e) => {
            setGeoQuery(e.target.value);
            if (geoErr) setGeoErr(null); // dismiss error as soon as the user retypes
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void searchLocation();
          }}
        />
        {geoQuery && (
          <button
            className="map-search-clear"
            aria-label="Clear"
            onClick={() => {
              setGeoQuery("");
              setGeoErr(null);
              setGeoResult(null);
            }}
          >
            ✕
          </button>
        )}
        <button className="map-search-go" onClick={() => void searchLocation()} disabled={geoBusy}>
          {geoBusy ? "…" : "Search"}
        </button>
        <button
          type="button"
          className={`map-drop${dropCenterMode ? " active" : ""}`}
          onClick={() => {
            setDropCenterMode((v) => !v);
            setGeoErr(null); // clear stale error when entering drop mode
          }}
          disabled={isImported}
          title="Click, then tap anywhere on the map to place the mission center"
          aria-pressed={dropCenterMode}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="8" />
            <line x1="12" y1="1" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="1" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="23" y2="12" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          </svg>
          {dropCenterMode ? "Tap map…" : "Drop center"}
        </button>
        <button
          type="button"
          className="map-drop"
          onClick={useMyLocation}
          disabled={isImported || geoLocBusy}
          title="Place the mission center at your current GPS location"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          {geoLocBusy ? "…" : "My location"}
        </button>
      </div>
      {/* Single notification slot — highest priority wins: error > hint > success */}
      {(geoLocErr ?? geoErr ?? geoResult ?? (dropCenterMode ? true : null)) && (
        <div
          className={`map-toast ${
            (geoLocErr ?? geoErr)
              ? "map-toast--error"
              : geoResult && !dropCenterMode
                ? "map-toast--ok"
                : "map-toast--hint"
          }`}
        >
          {geoLocErr ??
            geoErr ??
            (geoResult && !dropCenterMode ? (
              <>
                <span aria-hidden>📍</span> {geoResult}
              </>
            ) : (
              <>
                <span aria-hidden>🎯</span> Click the map to drop the mission center
              </>
            ))}
        </div>
      )}
    </>
  );
}
