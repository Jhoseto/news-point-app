import { describe, expect, it } from "vitest";
import { allocateRoadDotBudgets, incidentPathsAsSimRoads, simplifyRoadCoords } from "./traffic-simulation";

describe("traffic simulation", () => {
  it("turns incident LineStrings into congestion corridors", () => {
    const roads = incidentPathsAsSimRoads([
      {
        id: "a",
        category: 6,
        delaySec: 300,
        path: [
          { lat: 42.14, lon: 24.74 },
          { lat: 42.141, lon: 24.741 },
        ],
      },
    ]);
    expect(roads).toHaveLength(1);
    expect(roads[0]?.bucket).toBe("jam");
    expect(roads[0]?.source).toBe("incident");
  });

  it("caps dot budgets fairly", () => {
    const roads = [
      { coords: [[24.7, 42.1], [24.71, 42.11]] as [number, number][], type: "motorway", oneway: 0 as const, bucket: null, closure: false, source: "osm" as const },
      { coords: [[24.72, 42.12], [24.73, 42.13]] as [number, number][], type: "residential", oneway: 0 as const, bucket: null, closure: false, source: "osm" as const },
    ];
    const budgets = allocateRoadDotBudgets(roads, 900, 4);
    expect(budgets.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(4);
    expect(budgets.every((value) => value >= 0)).toBe(true);
  });

  it("thins long polylines", () => {
    const coords = Array.from({ length: 200 }, (_, index) => [24.7 + index * 0.0001, 42.1] as [number, number]);
    const simplified = simplifyRoadCoords(coords);
    expect(simplified.length).toBeLessThanOrEqual(81);
    expect(simplified.at(-1)).toEqual(coords.at(-1));
  });
});
