// Build a waypoint list from a chosen flight form and its parameters.
import {
  circleForm,
  destinationPoint,
  gridForm,
  lineForm,
  polygonForm,
  spiralForm,
  starForm,
} from "./geometry";
import type { Waypoint } from "./missionTypes";

export type FormKind =
  | "line"
  | "polygon"
  | "circle"
  | "grid"
  | "spiral"
  | "star"
  | "manual";

export interface FormParams {
  kind: FormKind;
  center: Waypoint;
  // shared
  radiusM: number;
  headingDeg: number;
  // line
  lengthM: number;
  spacingM: number;
  // polygon / star
  sides: number;
  innerRadiusM: number;
  // circle / spiral resolution
  points: number;
  // grid
  widthM: number;
  heightM: number;
  passSpacingM: number;
  // spiral
  startRadiusM: number;
  turns: number;
  // manual points
  manual: Waypoint[];
}

export const DEFAULT_FORM_PARAMS: FormParams = {
  kind: "circle",
  center: { lat: 47.4150833, lng: 9.3953087 },
  radiusM: 40,
  headingDeg: 0,
  lengthM: 100,
  spacingM: 10,
  sides: 5,
  innerRadiusM: 18,
  points: 16,
  widthM: 60,
  heightM: 80,
  passSpacingM: 12,
  startRadiusM: 5,
  turns: 3,
  manual: [],
};

export function buildForm(p: FormParams): Waypoint[] {
  switch (p.kind) {
    case "line": {
      const end = destinationPoint(p.center, p.headingDeg, p.lengthM);
      return lineForm(p.center, end, p.spacingM);
    }
    case "polygon":
      return polygonForm(p.center, p.radiusM, p.sides, p.headingDeg);
    case "circle":
      return circleForm(p.center, p.radiusM, p.points, p.headingDeg);
    case "grid":
      return gridForm({
        center: p.center,
        widthM: p.widthM,
        heightM: p.heightM,
        passSpacingM: p.passSpacingM,
        sampleSpacingM: p.spacingM,
        headingDeg: p.headingDeg,
      });
    case "spiral":
      return spiralForm({
        center: p.center,
        startRadiusM: p.startRadiusM,
        endRadiusM: p.radiusM,
        turns: p.turns,
        pointsPerTurn: p.points,
        rotationDeg: p.headingDeg,
      });
    case "star":
      return starForm({
        center: p.center,
        outerRadiusM: p.radiusM,
        innerRadiusM: p.innerRadiusM,
        points: p.sides,
        rotationDeg: p.headingDeg,
      });
    case "manual":
      return [...p.manual];
    default:
      return [];
  }
}
