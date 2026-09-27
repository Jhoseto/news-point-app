import type { TrafficIncident } from "../types";

/** Approximate speeds (m/s) by OSM highway class — simulation, not live GPS. */
export const SPEED_MPS: Record<string, number> = {
  motorway: 25,
  trunk: 20,
  primary: 14,
  secondary: 11,
  tertiary: 8,
  residential: 5,
  unclassified: 5,
};

export const DENSITY_MULT: Record<string, number> = {
  motorway: 3,
  trunk: 2.5,
  primary: 2,
  secondary: 1.5,
  tertiary: 1,
  residential: 0.5,
  unclassified: 0.4,
};

export const DOT_SIZE_BY_TYPE: Record<string, number> = {
  motorway: 6,
  trunk: 6,
  primary: 5,
  secondary: 5,
  tertiary: 4,
  residential: 4,
  unclassified: 4,
};

export const MAX_DOTS = 2500;
export const MAX_WAYPOINTS_PER_ROAD = 80;
export const DOT_HEIGHT_OFFSET_M = 3;

export type FlowBucket = "free" | "slow" | "jam";

export type SimRoad = {
  coords: [number, number][];
  type: string;
  oneway: 0 | 1 | -1;
  bucket: FlowBucket | null;
  closure: boolean;
  source: "osm" | "incident";
};

export function flowSpeedScale(bucket: FlowBucket | null): number {
  if (bucket === "jam") return 0.22;
  if (bucket === "slow") return 0.55;
  return 1;
}

export function flowDensityMult(bucket: FlowBucket | null): number {
  if (bucket === "jam") return 2.4;
  if (bucket === "slow") return 1.4;
  return 1;
}

function bucketForIncident(incident: Pick<TrafficIncident, "category" | "delaySec">): { bucket: FlowBucket | null; closure: boolean } {
  if (incident.category === 7 || incident.category === 8) return { bucket: null, closure: true };
  if (incident.category === 6) return { bucket: "jam", closure: false };
  if ((incident.delaySec ?? 0) >= 120) return { bucket: "jam", closure: false };
  if ((incident.delaySec ?? 0) >= 45) return { bucket: "slow", closure: false };
  return { bucket: "slow", closure: false };
}

/** TomTom incident LineStrings as honest congestion corridors (not vehicle tracks). */
export function incidentPathsAsSimRoads(
  incidents: Pick<TrafficIncident, "id" | "path" | "category" | "delaySec">[],
  limit = 24,
): SimRoad[] {
  const roads: SimRoad[] = [];
  for (const incident of incidents) {
    if (!incident.path || incident.path.length < 2) continue;
    const { bucket, closure } = bucketForIncident(incident);
    if (closure) continue;
    roads.push({
      coords: incident.path.map((point) => [point.lon, point.lat]),
      type: "primary",
      oneway: 0,
      bucket,
      closure: false,
      source: "incident",
    });
    if (roads.length >= limit) break;
  }
  return roads;
}

export function osmRecordsAsSimRoads(
  records: { coordinates: [number, number][]; type: string; oneway: 0 | 1 | -1 }[],
): SimRoad[] {
  return records.map((road) => ({
    coords: road.coordinates,
    type: road.type,
    oneway: road.oneway,
    bucket: null,
    closure: false,
    source: "osm",
  }));
}

function estimateRoadLengthM(coords: [number, number][]): number {
  let len = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1]![0] - coords[i]![0];
    const dy = coords[i + 1]![1] - coords[i]![1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len * 111_000;
}

export function computeDotCount(road: SimRoad, altitudeM: number): number {
  if (road.closure) return 0;
  const lengthM = estimateRoadLengthM(road.coords);
  let spacing: number;
  if (altitudeM < 1000) spacing = 30;
  else if (altitudeM < 3000) spacing = 80;
  else if (altitudeM < 5000) spacing = 150;
  else spacing = 250;

  const mult =
    (DENSITY_MULT[road.type] ?? 1) *
    flowDensityMult(road.bucket) *
    (road.source === "incident" ? 1.6 : 1);
  return Math.max(road.source === "incident" ? 2 : 1, Math.floor((lengthM / spacing) * mult));
}

export function allocateRoadDotBudgets(roads: SimRoad[], altitudeM: number, dotCap: number): number[] {
  const planned = roads.map((road) => computeDotCount(road, altitudeM));
  const budgets = new Array<number>(roads.length).fill(0);
  let remaining = Math.max(0, dotCap);

  const order = planned
    .map((count, index) => ({ count, index }))
    .sort((a, b) => b.count - a.count);

  for (const entry of order) {
    if (remaining <= 0) break;
    if (entry.count <= 0) continue;
    budgets[entry.index] = 1;
    remaining -= 1;
  }
  if (remaining <= 0) return budgets;

  let totalRemainder = 0;
  for (let i = 0; i < planned.length; i++) totalRemainder += Math.max(0, planned[i]! - budgets[i]!);
  if (totalRemainder <= 0) return budgets;

  const residuals: { index: number; residual: number }[] = [];
  let assigned = 0;
  for (let i = 0; i < planned.length; i++) {
    const cap = Math.max(0, planned[i]! - budgets[i]!);
    if (cap <= 0) continue;
    const ideal = (cap / totalRemainder) * remaining;
    const add = Math.min(cap, Math.floor(ideal));
    budgets[i]! += add;
    assigned += add;
    residuals.push({ index: i, residual: ideal - add });
  }

  let leftover = remaining - assigned;
  residuals.sort((a, b) => b.residual - a.residual);
  let cursor = 0;
  while (leftover > 0 && residuals.length > 0) {
    const idx = residuals[cursor % residuals.length]!.index;
    if (budgets[idx]! < planned[idx]!) {
      budgets[idx]! += 1;
      leftover -= 1;
    }
    cursor += 1;
    if (cursor > residuals.length * 4) break;
  }
  return budgets;
}

export function simplifyRoadCoords(coords: [number, number][]): [number, number][] {
  const step =
    coords.length > MAX_WAYPOINTS_PER_ROAD ? Math.ceil(coords.length / MAX_WAYPOINTS_PER_ROAD) : 1;
  const simplified: [number, number][] = [];
  for (let i = 0; i < coords.length; i += step) simplified.push(coords[i]!);
  const last = coords[coords.length - 1]!;
  const tail = simplified[simplified.length - 1];
  if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) simplified.push(last);
  return simplified.length >= 2 ? simplified : coords.slice(0, 2);
}
