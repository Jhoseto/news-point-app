import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");
const brand = resolve(root, "apps/web/public/brand");

describe("reader launch icons", () => {
  it.each([
    ["icon-192.png", 192], ["icon-512.png", 512], ["icon-maskable-512.png", 512],
    ["apple-touch-icon.png", 180], ["apple-touch-icon-120.png", 120],
    ["apple-touch-icon-152.png", 152], ["apple-touch-icon-167.png", 167],
  ] as const)("keeps %s centred, opaque and inside the circular safe area", async (name, size) => {
    const { data, info } = await sharp(resolve(brand, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([size, size, 4]);
    let left = size, right = 0, top = size, bottom = 0, radius = 0, ink = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      expect(data[offset + 3]).toBe(255);
      if (Math.min(data[offset], data[offset + 1], data[offset + 2]) < 240) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        radius = Math.max(radius, Math.hypot(x + .5 - size / 2, y + .5 - size / 2));
        ink++;
      }
    }
    expect(ink).toBeGreaterThan(size * size * .15);
    expect(radius).toBeLessThanOrEqual(size * .4);
    expect(Math.abs(left + right + 1 - size)).toBeLessThanOrEqual(2);
    expect(Math.abs(top + bottom + 1 - size)).toBeLessThanOrEqual(2);
  });

  it("does not change artwork geometry when the OS switches icon purpose", () => {
    expect(readFileSync(resolve(brand, "icon-512.png"))).toEqual(readFileSync(resolve(brand, "icon-maskable-512.png")));
  });
});
