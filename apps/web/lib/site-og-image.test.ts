import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";

describe("site OG share image", () => {
  it("ships a 1200×630 JPEG under 300 KiB", async () => {
    const file = join(import.meta.dirname, "../public/share/og-site-1200x630.jpg");
    const bytes = readFileSync(file);
    expect(bytes.length).toBeLessThanOrEqual(300_000);
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });

  it("ships a matching WebP under 300 KiB", async () => {
    const file = join(import.meta.dirname, "../public/share/og-site-1200x630.webp");
    const bytes = readFileSync(file);
    expect(bytes.length).toBeLessThanOrEqual(300_000);
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });
});
