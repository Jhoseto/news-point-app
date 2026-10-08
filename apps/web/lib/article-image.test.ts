import { describe, expect, it } from "vitest";
import { articleImageAttrs, compactSrcSet, preferWidthFromSizes } from "./article-image";

describe("article-image", () => {
  it("caps mobile lead srcset at 960w and prefers ≤800 src", () => {
    const media = {
      url: "/media/news/2026/story.webp",
      width: 2000,
      height: 1200,
      alt: "lead",
      caption: "",
      credit: "",
      variants: [
        { url: "/media/news/2026/story-w320.webp", width: 320, height: 192 },
        { url: "/media/news/2026/story-w768.webp", width: 768, height: 461 },
        { url: "/media/news/2026/story-w960.webp", width: 960, height: 576 },
        { url: "/media/news/2026/story-w1440.webp", width: 1440, height: 864 },
      ],
    };
    const attrs = articleImageAttrs(media, { priority: true, sizes: "100vw" });
    expect(attrs.src).toBe("/media/news/2026/story-w768.webp");
    expect(attrs.srcSet).toContain("768w");
    expect(attrs.srcSet).not.toContain("1440w");
    expect(attrs.sizes).toBe("100vw");
  });

  it("picks compact mid rungs for cards", () => {
    const set = compactSrcSet(
      "/a 320w, /b 768w, /c 960w, /d 1440w, /e 2000w",
      960,
    );
    expect(set).toBe("/a 320w, /b 768w, /c 960w");
  });

  it("maps sizes to prefer widths", () => {
    expect(preferWidthFromSizes("100vw", 960)).toBe(800);
    expect(preferWidthFromSizes("22vw", 960)).toBe(640);
  });
});
