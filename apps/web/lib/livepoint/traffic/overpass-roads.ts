/** Portable OSM way records for traffic simulation (adapted from gods-eye-view). */

export type OverpassRoad = {
  coordinates: [number, number][];
  type: string;
  oneway: 0 | 1 | -1;
};

export function normalizeOverpassRoads(payload: { elements?: unknown[] } | null | undefined): OverpassRoad[] {
  const roads: OverpassRoad[] = [];
  for (const element of payload?.elements ?? []) {
    if (!element || typeof element !== "object") continue;
    const way = element as {
      type?: string;
      geometry?: { lon: number; lat: number }[];
      tags?: { highway?: string; oneway?: string; junction?: string };
    };
    if (way.type !== "way" || !way.geometry || way.geometry.length < 2) continue;
    const onewayTag = way.tags?.oneway;
    roads.push({
      coordinates: way.geometry.map((point) => [point.lon, point.lat]),
      type: way.tags?.highway ?? "unclassified",
      oneway:
        onewayTag === "yes" || onewayTag === "1" || onewayTag === "true" || way.tags?.junction === "roundabout"
          ? 1
          : onewayTag === "-1"
            ? -1
            : 0,
    });
  }
  return roads;
}

export function overpassRoadQuery(
  south: number,
  west: number,
  north: number,
  east: number,
  { majorOnly = false, timeoutSec = 25 } = {},
): string {
  const regex = majorOnly
    ? "^(motorway|trunk|primary|secondary)$"
    : "^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$";
  return `[out:json][timeout:${timeoutSec}];(way["highway"~"${regex}"](${south},${west},${north},${east}););out geom qt;`;
}
