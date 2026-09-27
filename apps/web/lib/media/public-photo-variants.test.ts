import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import sharp from "sharp";
import { preparePublicPhotoVariants } from "./public-photo-variants";

it("creates proportional WebP variants once, with immutable content names and no metadata", async () => {
  const buffer = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#44aadd" } }).webp().toBuffer();
  const variants = await preparePublicPhotoVariants({ buffer, width: 2000, height: 1000 });
  expect(variants.map(item => item.width)).toEqual([320, 640, 960, 1440, 1920]);
  for (const variant of variants) {
    expect(variant.height).toBe(variant.width / 2);
    expect(variant.fileName).toMatch(/^[0-9a-f]{64}\.webp$/);
    const metadata = await sharp(variant.buffer).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.format).toBe("webp");
  }
});

it("does not enlarge a small photo or encode duplicate widths", async () => {
  const buffer = await sharp({ create: { width: 250, height: 125, channels: 3, background: "#44aadd" } }).webp().toBuffer();
  const variants = await preparePublicPhotoVariants({ buffer, width: 250, height: 125 });
  expect(variants.map(item => item.width)).toEqual([250]);
});

it("rejects unprocessed or mismatched input", async () => {
  const buffer = await sharp({ create: { width: 250, height: 125, channels: 3, background: "#44aadd" } }).png().toBuffer();
  await expect(preparePublicPhotoVariants({ buffer, width: 250, height: 125 })).rejects.toThrow("Invalid clean master");
  const webp = await sharp(buffer).webp().toBuffer();
  await expect(preparePublicPhotoVariants({ buffer: webp, width: 999, height: 125 })).rejects.toThrow("Invalid clean master");
});
