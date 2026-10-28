import { describe, expect, it } from "vitest";
import { articleImageAttrs } from "./article-image";
import { storyRailImageSizes, storyThemeImage } from "./story-theme-image";

describe("theme thumbnail image delivery", () => {
  it("uses existing responsive versions while preserving the original and centered composition", () => {
    const image = storyThemeImage({
      heroUrl: "/media/news/fixture.webp",
      heroImage: { width: 1600, height: 900, variants: [320, 480, 768].map(width => ({
        url: `/media/news/fixture-w${width}.webp`, width, height: width * 9 / 16,
      })) },
    })!;
    const attrs = articleImageAttrs(image, { sizes: storyRailImageSizes(image), resolution: "content" });
    expect(image.url).toBe("/media/news/fixture.webp");
    expect(image.focalPoint).toBeUndefined();
    expect(image.alt).toBe("");
    expect(attrs.src).toBe("/media/news/fixture-w480.webp");
    expect(attrs.srcSet).toContain("320w");
    expect(attrs.srcSet).toContain("768w");
    expect(attrs.srcSet).toContain("1600w");
    // Account for object-cover's horizontal source pixels, including high-DPR screens.
    expect(parseFloat(attrs.sizes!)).toBeCloseTo(5.25 * 16 / 9);
  });
  it("keeps the original fallback for old cached themes and images without variants", () => {
    const legacy = storyThemeImage({ heroUrl: "/media/news/legacy.webp" })!;
    expect(articleImageAttrs(legacy)).toEqual({ src: "/media/news/legacy.webp" });
    expect(storyRailImageSizes(legacy)).toBe("5.25rem");
    expect(storyThemeImage({ heroUrl: null })).toBeNull();
  });
  it("does not stretch the requested source width for portrait pictures", () => {
    const portrait = storyThemeImage({heroUrl: "/media/news/portrait.webp", heroImage: {width: 800, height: 1200}})!;
    expect(storyRailImageSizes(portrait)).toBe("5.25rem");
  });
});
