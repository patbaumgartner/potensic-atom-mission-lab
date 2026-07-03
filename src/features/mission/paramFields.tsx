// Generic numeric slider field used throughout the mission-parameters panels.
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string | undefined;
  onChange: (v: number) => void;
  onCommit?: (() => void) | undefined;
}) {
  return (
    <label className="slider">
      <span>
        {label}
        <strong>
          {value}
          {unit}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onCommit}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
}
