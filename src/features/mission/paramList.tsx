// Per-form-kind parameter list renderer: maps each numeric FormParams field to
// a SliderField using shared metadata (label/min/max/step/unit).
import { SliderField } from "./paramFields";
import type { FormParams } from "./formBuilder";

const PARAM_META: Record<
  string,
  { label: string; min: number; max: number; step: number; unit?: string }
> = {
  radiusM: { label: "Radius", min: 5, max: 200, step: 1, unit: " m" },
  lengthM: { label: "Length", min: 10, max: 400, step: 5, unit: " m" },
  spacingM: { label: "Spacing", min: 1, max: 50, step: 1, unit: " m" },
  sides: { label: "Sides", min: 3, max: 12, step: 1 },
  innerRadiusM: { label: "Inner radius", min: 2, max: 150, step: 1, unit: " m" },
  points: { label: "Points", min: 4, max: 48, step: 1 },
  widthM: { label: "Width", min: 10, max: 300, step: 5, unit: " m" },
  heightM: { label: "Height", min: 10, max: 300, step: 5, unit: " m" },
  passSpacingM: { label: "Pass spacing", min: 3, max: 40, step: 1, unit: " m" },
  startRadiusM: { label: "Start radius", min: 0, max: 100, step: 1, unit: " m" },
  turns: { label: "Turns", min: 1, max: 8, step: 1 },
};

export function renderParams(
  params: FormParams,
  set: (patch: Partial<FormParams>) => void,
  onCommit?: () => void,
) {
  const field = (k: keyof FormParams) => {
    const meta = PARAM_META[k as string];
    return (
      <SliderField
        key={k}
        label={meta.label}
        unit={meta.unit}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={params[k] as number}
        onCommit={onCommit}
        onChange={(v) => set({ [k]: v })}
      />
    );
  };
  switch (params.kind) {
    case "line":
      return [field("lengthM"), field("spacingM")];
    case "polygon":
      return [field("radiusM"), field("sides")];
    case "circle":
      return [field("radiusM"), field("points")];
    case "grid":
      return [field("widthM"), field("heightM"), field("passSpacingM"), field("spacingM")];
    case "spiral":
      return [field("startRadiusM"), field("radiusM"), field("turns"), field("points")];
    case "star":
      return [field("radiusM"), field("innerRadiusM"), field("sides")];
    default:
      return null;
  }
}
