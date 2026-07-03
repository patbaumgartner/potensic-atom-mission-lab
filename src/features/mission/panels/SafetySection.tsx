import { SliderField } from "../paramFields";

export function SafetySection({
  batteryMin,
  setBatteryMin,
  reservePct,
  setReservePct,
  geofenceM,
  setGeofenceM,
  enduranceFrac,
  durationFmt,
  usableMin,
  maxHomeM,
}: {
  batteryMin: number;
  setBatteryMin: (v: number) => void;
  reservePct: number;
  setReservePct: (v: number) => void;
  geofenceM: number;
  setGeofenceM: (v: number) => void;
  enduranceFrac: number;
  durationFmt: string;
  usableMin: number;
  maxHomeM: number;
}) {
  return (
    <section>
      <h2>Safety &amp; battery</h2>
      <div className="params-list">
        <SliderField
          label="Battery"
          unit=" min"
          value={batteryMin}
          min={5}
          max={35}
          step={1}
          onChange={setBatteryMin}
        />
        <SliderField
          label="Reserve"
          unit=" %"
          value={reservePct}
          min={0}
          max={50}
          step={5}
          onChange={setReservePct}
        />
        <SliderField
          label="Geofence radius"
          unit=" m"
          value={geofenceM}
          min={20}
          max={500}
          step={10}
          onChange={setGeofenceM}
        />
      </div>
      <div
        className={`battery-bar ${enduranceFrac > 1 ? "over" : enduranceFrac > 0.85 ? "near" : ""}`}
      >
        <div className="battery-fill" style={{ width: `${Math.min(100, enduranceFrac * 100)}%` }} />
      </div>
      <p className="hint">
        Uses {durationFmt} of ~{usableMin.toFixed(0)} min usable ({Math.round(enduranceFrac * 100)}
        %) · max {maxHomeM.toFixed(0)} m from home.
      </p>
    </section>
  );
}
