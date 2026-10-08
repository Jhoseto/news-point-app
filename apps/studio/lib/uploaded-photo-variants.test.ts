import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  mergePresentationVariants,
  missingVariantWidths,
  neededVariantWidths,
  prepareArchiveVariantsFromOriginal,
  prepareUploadedPhotoWithVariants,
  variantStorageKey,
} from "./uploaded-photo";

describe("archive / upload variant helpers", () => {
  it("lists ladder widths below the source", () => {
    expect(neededVariantWidths(3000)).toEqual([320, 480, 768, 1024, 1440, 1920]);
    expect(neededVariantWidths(900)).toEqual([320, 480, 768]);
    expect(neededVariantWidths(200)).toEqual([]);
  });

  it("detects missing ladder rungs against a WP-style card only", () => {
    expect(missingVariantWidths(1600, [{ width: 960 }])).toEqual([320, 480, 768, 1024, 1440]);
    expect(missingVariantWidths(1600, [320, 480, 768, 1024, 1440].map((width) => ({ width })))).toEqual([]);
  });

  it("builds sibling -w keys next to the archive original", () => {
    expect(variantStorageKey("news/2024/03/Designer.webp", 768)).toBe("news/2024/03/Designer-w768.webp");
    expect(variantStorageKey("news/2026/09/abc-w1024.webp", 480)).toBe("news/2026/09/abc-w480.webp");
  });

  it("merges generated ladder over old card variants without exceeding 6", () => {
    const merged = mergePresentationVariants(
      [{ url: "/media/news/2024/03/x-card.webp", width: 960, height: 540 }],
      [
        { url: "/media/news/2024/03/x-w320.webp", width: 320, height: 180 },
        { url: "/media/news/2024/03/x-w768.webp", width: 768, height: 432 },
      ],
      1600,
    );
    expect(merged.map((entry) => entry.width)).toEqual([320, 768, 960]);
  });

  it("encodes archive variants from the original, not a second lossy pass on a master", async () => {
    const input = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: "#336699" },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const prepared = await prepareArchiveVariantsFromOriginal(input);
    expect(prepared.sourceWidth).toBe(1600);
    expect(prepared.variants.map((variant) => variant.width)).toEqual([320, 480, 768, 1024, 1440]);
    for (const variant of prepared.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(variant.width);
    }
  });

  it("upload ladder still emits webp variants under the full size", async () => {
    const input = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: "#445566" },
    })
      .jpeg()
      .toBuffer();
    const prepared = await prepareUploadedPhotoWithVariants(input);
    expect(prepared.variants.map((variant) => variant.width)).toEqual([320, 480, 768, 1024, 1440, 1920]);
  });
});
