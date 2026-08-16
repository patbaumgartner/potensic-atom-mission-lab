// Trust boundary for every value that re-enters the app from outside its own
// memory: localStorage, and user-supplied project JSON.
//
// Nothing here throws. Each parser turns `unknown` into a fully-formed domain
// value, substituting defaults for anything missing or malformed and clamping
// numbers into ranges the geometry generators can survive. A corrupt entry must
// never be able to crash a render, because the bad value is persisted -- a
// throw would white-screen the app on every subsequent reload.

import { DEFAULT_FORM_PARAMS, type FormKind, type FormParams } from "./formBuilder";
import { normalizeLongitude } from "./geometry";
import { ATOM_LIMITS, type Waypoint } from "./missionTypes";

export interface SavedMission {
  id: string;
  name: string;
  color: string;
  waypoints: Waypoint[];
  plannedHeightM: number;
  plannedSpeedMs: number;
}

export interface Workspace {
  params: FormParams;
  name: string;
  heightM: number;
  speedMs: number;
  chunkSize: number;
  batteryMin: number;
  reservePct: number;
  geofenceM: number;
  editingId: string | null;
}

export interface Project {
  library: SavedMission[];
  workspace: Workspace;
}

export interface LoadedLibrary {
  library: SavedMission[];
  persistenceBlocked: boolean;
}

export interface LoadedWorkspace {
  workspace: Workspace;
  persistenceBlocked: boolean;
}

export const LIBRARY_KEY = "atom-mission-library";
export const WORKSPACE_KEY = "atom-mission-workspace";
export const WORKSPACE_VERSION = 2;
const LEGACY_WORKSPACE_VERSION = 1;

export const PALETTE = [
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#f59e0b",
];

export const DEFAULT_WORKSPACE: Workspace = {
  params: DEFAULT_FORM_PARAMS,
  name: "Mission",
  heightM: 20,
  speedMs: 5,
  chunkSize: ATOM_LIMITS.maxWaypointsPerRecord,
  batteryMin: 20,
  reservePct: 25,
  geofenceM: 150,
  editingId: null,
};

/**
 * Safety ceilings for persisted form parameters. These are deliberately far
 * wider than the sidebar sliders: their only job is to keep a hand-edited or
 * corrupt value from producing an unusable mission, not to constrain the UI.
 */
const BOUNDS = {
  radiusM: [0, 5_000],
  lengthM: [0, 20_000],
  spacingM: [0.5, 1_000],
  sides: [3, 60],
  innerRadiusM: [0, 5_000],
  points: [3, 200],
  widthM: [0, 20_000],
  heightM: [0, 20_000],
  passSpacingM: [0.5, 5_000],
  startRadiusM: [0, 5_000],
  turns: [0, 50],
  cinematicViewIndex: [0, 7],
  buildingWidthM: [1, 20_000],
  buildingDepthM: [1, 20_000],
  buildingClearanceM: [1, 5_000],
  cinematicShotLengthM: [1, 20_000],
  cinematicLeadInM: [0, 5_000],
  cinematicTargetHeightM: [0, 10_000],
} as const satisfies Record<string, readonly [number, number]>;

const FORM_KINDS: readonly FormKind[] = [
  "line",
  "polygon",
  "circle",
  "grid",
  "spiral",
  "star",
  "cinematic",
  "manual",
];

const FORM_PARAM_KEYS = Object.keys(DEFAULT_FORM_PARAMS);
const CINEMATIC_PARAM_KEYS: readonly (keyof FormParams)[] = [
  "cinematicMode",
  "cinematicViewCount",
  "cinematicViewIndex",
  "buildingWidthM",
  "buildingDepthM",
  "buildingClearanceM",
  "cinematicShotLengthM",
  "cinematicLeadInM",
  "cinematicTargetHeightM",
];
const LEGACY_FORM_PARAM_KEYS = FORM_PARAM_KEYS.filter(
  (key) => !CINEMATIC_PARAM_KEYS.includes(key as keyof FormParams),
);
const FORM_NUMBER_KEYS: readonly (keyof FormParams)[] = [
  "radiusM",
  "headingDeg",
  "lengthM",
  "spacingM",
  "sides",
  "innerRadiusM",
  "points",
  "widthM",
  "heightM",
  "passSpacingM",
  "startRadiusM",
  "turns",
  "cinematicViewCount",
  "cinematicViewIndex",
  "buildingWidthM",
  "buildingDepthM",
  "buildingClearanceM",
  "cinematicShotLengthM",
  "cinematicLeadInM",
  "cinematicTargetHeightM",
];
const WORKSPACE_KEYS: readonly (keyof Workspace)[] = [
  "params",
  "name",
  "heightM",
  "speedMs",
  "chunkSize",
  "batteryMin",
  "reservePct",
  "geofenceM",
  "editingId",
];
const WORKSPACE_NUMBER_KEYS: readonly (keyof Workspace)[] = [
  "heightM",
  "speedMs",
  "chunkSize",
  "batteryMin",
  "reservePct",
  "geofenceM",
];
const LEGACY_FORM_NUMBER_KEYS = FORM_NUMBER_KEYS.filter(
  (key) => !CINEMATIC_PARAM_KEYS.includes(key),
);

export const MAX_TEXT_LENGTH = 200;
const MAX_NAME_LENGTH = MAX_TEXT_LENGTH;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown, fallback: number, [min, max]: readonly [number, number]): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function int(value: unknown, fallback: number, range: readonly [number, number]): number {
  return Math.round(num(value, fallback, range));
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.slice(0, MAX_NAME_LENGTH) : fallback;
}

function hasFields(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => key in value);
}

function hasFiniteNumbers(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}

function isCanonicalWaypoint(value: unknown): boolean {
  const waypoint = record(value);
  if (!waypoint) return false;
  const { lat, lng } = waypoint;
  const [latMin, latMax] = ATOM_LIMITS.latRange;
  const [lngMin, lngMax] = ATOM_LIMITS.lngRange;
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= latMin &&
    lat <= latMax &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= lngMin &&
    lng < lngMax
  );
}

function isLosslessWorkspace(raw: Record<string, unknown>, parsed: Workspace): boolean {
  const params = record(raw.params);
  const isLegacy = raw.v === LEGACY_WORKSPACE_VERSION;
  const requiredParamKeys = isLegacy ? LEGACY_FORM_PARAM_KEYS : FORM_PARAM_KEYS;
  const requiredNumberKeys = isLegacy ? LEGACY_FORM_NUMBER_KEYS : FORM_NUMBER_KEYS;
  if (
    (raw.v !== WORKSPACE_VERSION && !isLegacy) ||
    !hasFields(raw, WORKSPACE_KEYS) ||
    (raw.editingId !== null &&
      (typeof raw.editingId !== "string" || raw.editingId.length > MAX_NAME_LENGTH)) ||
    typeof raw.name !== "string" ||
    raw.name !== parsed.name ||
    !hasFiniteNumbers(raw, WORKSPACE_NUMBER_KEYS) ||
    WORKSPACE_NUMBER_KEYS.some((key) => raw[key] !== parsed[key]) ||
    !params ||
    !hasFields(params, requiredParamKeys) ||
    !hasFiniteNumbers(params, requiredNumberKeys) ||
    params.kind !== parsed.params.kind ||
    requiredNumberKeys.some((key) => params[key] !== parsed.params[key]) ||
    (!isLegacy && params.cinematicMode !== parsed.params.cinematicMode) ||
    !isCanonicalWaypoint(params.center) ||
    !Array.isArray(params.manual) ||
    params.manual.length > ATOM_LIMITS.maxWaypointsPerMission ||
    !params.manual.every(isCanonicalWaypoint)
  ) {
    return false;
  }
  return true;
}

function canResumeEditing(raw: Record<string, unknown>, parsed: Workspace): boolean {
  return typeof raw.editingId === "string" && isLosslessWorkspace(raw, parsed);
}

export function parseWaypoint(value: unknown): Waypoint | null {
  const w = record(value);
  if (!w) return null;
  const { lat, lng } = w;
  if (typeof lat !== "number" || !Number.isFinite(lat)) return null;
  if (typeof lng !== "number" || !Number.isFinite(lng)) return null;
  const [latMin, latMax] = ATOM_LIMITS.latRange;
  if (lat < latMin || lat > latMax) return null;
  const [lngMin, lngMax] = ATOM_LIMITS.lngRange;
  return { lat, lng: lng >= lngMin && lng < lngMax ? lng : normalizeLongitude(lng) };
}

/** Drops malformed points and caps the list at the per-mission ceiling. */
export function parseWaypoints(value: unknown): Waypoint[] {
  if (!Array.isArray(value)) return [];
  const out: Waypoint[] = [];
  for (const item of value) {
    if (out.length >= ATOM_LIMITS.maxWaypointsPerMission) break;
    const wp = parseWaypoint(item);
    if (wp) out.push(wp);
  }
  return out;
}

function parseWaypointsStrict(value: unknown): Waypoint[] | null {
  if (!Array.isArray(value) || value.length > ATOM_LIMITS.maxWaypointsPerMission) return null;
  const out: Waypoint[] = [];
  for (const item of value) {
    if (!isCanonicalWaypoint(item)) return null;
    const waypoint = item as Record<string, number>;
    out.push({ lat: waypoint.lat, lng: waypoint.lng });
  }
  return out;
}

export function parseFormParams(value: unknown): FormParams {
  const p = record(value);
  if (!p) return DEFAULT_FORM_PARAMS;
  const d = DEFAULT_FORM_PARAMS;
  const kind = FORM_KINDS.find((k) => k === p.kind) ?? d.kind;
  return {
    kind,
    center: parseWaypoint(p.center) ?? d.center,
    radiusM: num(p.radiusM, d.radiusM, BOUNDS.radiusM),
    headingDeg: ((num(p.headingDeg, d.headingDeg, [-3.6e5, 3.6e5]) % 360) + 360) % 360,
    lengthM: num(p.lengthM, d.lengthM, BOUNDS.lengthM),
    spacingM: num(p.spacingM, d.spacingM, BOUNDS.spacingM),
    sides: int(p.sides, d.sides, BOUNDS.sides),
    innerRadiusM: num(p.innerRadiusM, d.innerRadiusM, BOUNDS.innerRadiusM),
    points: int(p.points, d.points, BOUNDS.points),
    widthM: num(p.widthM, d.widthM, BOUNDS.widthM),
    heightM: num(p.heightM, d.heightM, BOUNDS.heightM),
    passSpacingM: num(p.passSpacingM, d.passSpacingM, BOUNDS.passSpacingM),
    startRadiusM: num(p.startRadiusM, d.startRadiusM, BOUNDS.startRadiusM),
    turns: num(p.turns, d.turns, BOUNDS.turns),
    cinematicMode:
      p.cinematicMode === "shots" || p.cinematicMode === "route"
        ? p.cinematicMode
        : d.cinematicMode,
    cinematicViewCount:
      p.cinematicViewCount === 4 || p.cinematicViewCount === 8
        ? p.cinematicViewCount
        : d.cinematicViewCount,
    cinematicViewIndex: int(p.cinematicViewIndex, d.cinematicViewIndex, BOUNDS.cinematicViewIndex),
    buildingWidthM: num(p.buildingWidthM, d.buildingWidthM, BOUNDS.buildingWidthM),
    buildingDepthM: num(p.buildingDepthM, d.buildingDepthM, BOUNDS.buildingDepthM),
    buildingClearanceM: num(p.buildingClearanceM, d.buildingClearanceM, BOUNDS.buildingClearanceM),
    cinematicShotLengthM: num(
      p.cinematicShotLengthM,
      d.cinematicShotLengthM,
      BOUNDS.cinematicShotLengthM,
    ),
    cinematicLeadInM: num(p.cinematicLeadInM, d.cinematicLeadInM, BOUNDS.cinematicLeadInM),
    cinematicTargetHeightM: num(
      p.cinematicTargetHeightM,
      d.cinematicTargetHeightM,
      BOUNDS.cinematicTargetHeightM,
    ),
    manual: parseWaypoints(p.manual),
  };
}

export function parseSavedMission(value: unknown): SavedMission | null {
  const e = record(value);
  if (!e) return null;
  if (typeof e.id !== "string" || e.id.length === 0 || e.id.length > MAX_NAME_LENGTH) return null;
  if (typeof e.name !== "string" || e.name.length > MAX_NAME_LENGTH) return null;
  if (typeof e.color !== "string" || e.color.length > MAX_NAME_LENGTH) return null;
  if (
    typeof e.plannedHeightM !== "number" ||
    !Number.isFinite(e.plannedHeightM) ||
    e.plannedHeightM < 0 ||
    e.plannedHeightM > ATOM_LIMITS.maxPlannedHeightM
  ) {
    return null;
  }
  if (
    typeof e.plannedSpeedMs !== "number" ||
    !Number.isFinite(e.plannedSpeedMs) ||
    e.plannedSpeedMs < 0 ||
    e.plannedSpeedMs > ATOM_LIMITS.maxPlannedSpeedMs
  ) {
    return null;
  }
  const waypoints = parseWaypointsStrict(e.waypoints);
  if (!waypoints) return null;
  return {
    id: e.id,
    name: e.name,
    color: e.color,
    waypoints,
    plannedHeightM: e.plannedHeightM,
    plannedSpeedMs: e.plannedSpeedMs,
  };
}

function parseLibraryStrict(value: unknown): SavedMission[] | null {
  if (!Array.isArray(value) || value.length > ATOM_LIMITS.maxLibraryEntries) return null;
  const seen = new Set<string>();
  const out: SavedMission[] = [];
  for (const item of value) {
    const entry = parseSavedMission(item);
    if (!entry || seen.has(entry.id)) return null;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

/** Rejects the whole library if accepting it would silently discard route data. */
export function parseLibrary(value: unknown): SavedMission[] {
  return parseLibraryStrict(value) ?? [];
}

export function parseWorkspace(value: unknown): Workspace {
  const ws = record(value);
  if (ws?.v !== WORKSPACE_VERSION && ws?.v !== LEGACY_WORKSPACE_VERSION) return DEFAULT_WORKSPACE;
  const d = DEFAULT_WORKSPACE;
  const parsed: Workspace = {
    params: parseFormParams(ws.params),
    name: text(ws.name, d.name),
    heightM: num(ws.heightM, d.heightM, [0, 10_000]),
    speedMs: num(ws.speedMs, d.speedMs, [0, 100]),
    chunkSize: int(ws.chunkSize, d.chunkSize, [1, ATOM_LIMITS.maxWaypointsPerRecord]),
    batteryMin: num(ws.batteryMin, d.batteryMin, [1, 600]),
    reservePct: num(ws.reservePct, d.reservePct, [0, 95]),
    geofenceM: num(ws.geofenceM, d.geofenceM, [1, 100_000]),
    editingId: null,
  };
  if (canResumeEditing(ws, parsed)) parsed.editingId = ws.editingId as string;
  return parsed;
}

/**
 * Parse an exported project file. Returns null for anything that is not
 * recognisably a project, so the caller can report a failure and leave the
 * current workspace untouched rather than applying a half-valid payload.
 */
export function parseProject(value: unknown): Project | null {
  const data = record(value);
  if (!data) return null;
  const workspaceValue = record(data.workspace);
  const library = parseLibraryStrict(data.library);
  const workspace = parseWorkspace(data.workspace);
  if (!workspaceValue || !isLosslessWorkspace(workspaceValue, workspace) || library === null) {
    return null;
  }
  if (workspace.editingId !== null && !library.some((entry) => entry.id === workspace.editingId)) {
    return null;
  }
  return { library, workspace };
}

export function loadWorkspace(): Workspace {
  return loadWorkspaceState().workspace;
}

export function loadWorkspaceState(): LoadedWorkspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw === null) return { workspace: DEFAULT_WORKSPACE, persistenceBlocked: false };
    const value = JSON.parse(raw) as unknown;
    const parsed = parseWorkspace(value);
    const source = record(value);
    return source && isLosslessWorkspace(source, parsed)
      ? { workspace: parsed, persistenceBlocked: false }
      : { workspace: parsed, persistenceBlocked: true };
  } catch {
    return { workspace: DEFAULT_WORKSPACE, persistenceBlocked: true };
  }
}

export function loadLibraryState(): LoadedLibrary {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw === null) return { library: [], persistenceBlocked: false };
    const library = parseLibraryStrict(JSON.parse(raw));
    return library === null
      ? { library: [], persistenceBlocked: true }
      : { library, persistenceBlocked: false };
  } catch {
    return { library: [], persistenceBlocked: true };
  }
}

export function loadLibrary(): SavedMission[] {
  return loadLibraryState().library;
}

/** Remove all persisted state. Used by the error-boundary recovery action. */
export function clearPersistedState(): void {
  try {
    localStorage.removeItem(WORKSPACE_KEY);
    localStorage.removeItem(LIBRARY_KEY);
  } catch {
    /* storage unavailable; nothing to clear */
  }
}

export function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
