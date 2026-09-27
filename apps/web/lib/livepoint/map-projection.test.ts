import { describe, expect, it } from "vitest";
import { fromPixels, pointAtOffset, toPixels, visibleTiles } from "./map-projection";

describe("report map coordinates", () => {
  it.each([3, 12, 15, 19])("preserves the selected point at zoom %s", zoom => {
    const point = { lat: 42.1354, lon: 24.7453 };
    const pixel = toPixels(point, zoom);
    const result = fromPixels(pixel.x, pixel.y, zoom);
    expect(result.lat).toBeCloseTo(point.lat, 8);
    expect(result.lon).toBeCloseTo(point.lon, 8);
  });
  it("maps click offsets east and south independently of map dimensions", () => {
    const point = { lat: 42.1354, lon: 24.7453 };
    const selected = pointAtOffset(point, 15, 80, 60);
    expect(selected.lon).toBeGreaterThan(point.lon);
    expect(selected.lat).toBeLessThan(point.lat);
    expect(pointAtOffset(point, 15, 0, 0).lat).toBeCloseTo(point.lat, 8);
  });
  it("wraps longitudes and clamps poles instead of creating invalid points", () => {
    expect(fromPixels(256 * 2 ** 15 + 100, -100, 15).lon).toBeGreaterThanOrEqual(-180);
    expect(fromPixels(256 * 2 ** 15 + 100, -100, 15).lat).toBeLessThanOrEqual(85.0512);
  });
  it("requests only valid visible tiles including the centre on small screens", () => {
    const tiles = visibleTiles({ lat: 42.1354, lon: 24.7453 }, 15, 340, 300);
    expect(tiles.some(tile => tile.center)).toBe(true);
    expect(tiles.length).toBeLessThanOrEqual(9);
    expect(tiles.every(tile => tile.x >= 0 && tile.x < 2 ** 15 && tile.y >= 0 && tile.y < 2 ** 15)).toBe(true);
  });
});
