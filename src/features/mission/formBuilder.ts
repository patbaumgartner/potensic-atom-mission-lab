// Build a waypoint list from a chosen flight form and its parameters.
import {
  generateCinematicPlan,
  type CinematicMode,
  type CinematicPlan,
  type CinematicViewCount,
} from "./cinematic";
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
  "line" | "polygon" | "circle" | "grid" | "spiral" | "star" | "cinematic" | "manual";

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
  // cinematic building shots
  cinematicMode: CinematicMode;
  cinematicViewCount: CinematicViewCount;
  cinematicViewIndex: number;
  buildingWidthM: number;
  buildingDepthM: number;
  buildingClearanceM: number;
  cinematicShotLengthM: number;
  cinematicLeadInM: number;
  cinematicTargetHeightM: number;
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
  cinematicMode: "shots",
  cinematicViewCount: 8,
  cinematicViewIndex: 0,
  buildingWidthM: 20,
  buildingDepthM: 15,
  buildingClearanceM: 20,
  cinematicShotLengthM: 30,
  cinematicLeadInM: 10,
  cinematicTargetHeightM: 5,
  manual: [],
};

export function buildCinematicPlanFromForm(p: FormParams, flightAltitudeM: number): CinematicPlan {
  return generateCinematicPlan({
    center: p.center,
    frontBearingDeg: p.headingDeg,
    viewCount: p.cinematicViewCount,
    buildingWidthM: p.buildingWidthM,
    buildingDepthM: p.buildingDepthM,
    clearanceM: p.buildingClearanceM,
    shotLengthM: p.cinematicShotLengthM,
    leadInM: p.cinematicLeadInM,
    flightAltitudeM,
    targetHeightM: p.cinematicTargetHeightM,
  });
}

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
    case "cinematic": {
      const plan = buildCinematicPlanFromForm(p, 0);
      if (p.cinematicMode === "route") return plan.combinedRoute;
      const index = Math.min(plan.shots.length - 1, Math.max(0, Math.round(p.cinematicViewIndex)));
      return [...plan.shots[index].waypoints];
    }
    case "manual":
      return [...p.manual];
    default:
      return [];
  }
}
