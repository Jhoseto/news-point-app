import { describe, expect, it } from "vitest";
import { carouselCloneCount } from "./carousel-clones";

describe("carousel loop suffix", () => {
  it("covers the visible reverse seam and two viewports of drag without cloning the archive", () => {
    for (const [viewport, step] of [[390, 192], [1024, 264], [1600, 284], [3500, 284]]) {
      const originals = 50;
      const count = carouselCloneCount(originals, viewport!, originals * step!);
      expect(count).toBeLessThan(originals);
      expect(count * step!).toBeGreaterThanOrEqual(3 * viewport! + step!);
    }
  });
  it("keeps complete short sets and adapts to viewport/card resizing", () => {
    expect(carouselCloneCount(3, 1024, 3 * 264)).toBe(3);
    expect(carouselCloneCount(50, 390, 50 * 192)).toBe(9);
    expect(carouselCloneCount(50, 1440, 50 * 264)).toBe(19);
    expect(carouselCloneCount(50, 5000, 50 * 264)).toBe(50);
  });
  it("does not materialize a hidden or empty strip", () => {
    for (const args of [[0, 390, 0], [1, 390, 200], [50, 0, 10000], [50, 390, 0], [50, Infinity, 10000]]) {
      expect(carouselCloneCount(args[0]!, args[1]!, args[2]!)).toBe(0);
    }
  });
});
