import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareUploadedPhoto, prepareUploadedPhotoWithVariants } from "./uploaded-photo";

describe("uploaded photo", () => {
  it("matches the news upload: rotated WebP, no enlargement past 4096, no EXIF", async () => {
    const input = await sharp({ create: { width: 5000, height: 2000, channels: 3, background: "#2255aa" } }).withMetadata().jpeg().toBuffer();
    const output = await prepareUploadedPhoto(input);
    const metadata = await sharp(output.buffer).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(4096);
    expect(metadata.height).toBe(1638);
    expect(metadata.exif).toBeUndefined();
    expect(output.width).toBe(4096);
    expect(output.height).toBe(1638);
  });

  it("emits a width ladder of variants under the full size", async () => {
    const input = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#445566" } }).jpeg().toBuffer();
    const prepared = await prepareUploadedPhotoWithVariants(input);
    expect(prepared.full.width).toBe(3000);
    const widths = prepared.variants.map((variant) => variant.width);
    // Variants strictly smaller than the full width, in ascending order.
    expect(widths).toEqual([320, 480, 768, 1024, 1440, 1920]);
    for (const variant of prepared.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(variant.width);
      // Aspect ratio preserved (integer rounding tolerance).
      const expectedHeight = Math.round(variant.width / (3000 / 1500));
      expect(Math.abs((meta.height ?? 0) - expectedHeight)).toBeLessThanOrEqual(1);
    }
  });

  it("does not emit variants larger than the source", async () => {
    const input = await sharp({ create: { width: 200, height: 150, channels: 3, background: "#aabbcc" } }).jpeg().toBuffer();
    const prepared = await prepareUploadedPhotoWithVariants(input);
    expect(prepared.full.width).toBe(200);
    expect(prepared.variants.length).toBe(0);
  });
});