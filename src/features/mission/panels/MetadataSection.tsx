import { SliderField } from "../paramFields";

export function MetadataSection({
  name,
  setName,
  chunkSize,
  setChunkSize,
  heightM,
  setHeightM,
  speedMs,
  setSpeedMs,
}: {
  name: string;
  setName: (v: string) => void;
  chunkSize: number;
  setChunkSize: (v: number) => void;
  heightM: number;
  setHeightM: (v: number) => void;
  speedMs: number;
  setSpeedMs: (v: number) => void;
}) {
  return (
    <section>
      <h2>Mission metadata</h2>
      <div className="params-list">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <SliderField
          label="Chunk size"
          value={chunkSize}
          min={1}
          max={45}
          step={1}
          onChange={setChunkSize}
        />
        <SliderField
          label="Height (manual)"
          unit=" m"
          value={heightM}
          min={0}
          max={120}
          step={1}
          onChange={setHeightM}
        />
        <SliderField
          label="Speed"
          unit=" m/s"
          value={speedMs}
          min={1}
          max={15}
          step={0.5}
          onChange={setSpeedMs}
        />
      </div>
      <p className="warn">
        Atom ignores per-waypoint height/gimbal. Climb to altitude manually before starting; these
        values are metadata only.
      </p>
    </section>
  );
}
