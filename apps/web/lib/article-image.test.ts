import { describe, expect, it } from "vitest";
import { articleImageAttrs, compactSrcSet, preferWidthFromSizes } from "./article-image";

describe("article-image", () => {
  const largeMedia = {
    url: "/media/news/2026/large.webp", width: 2400, height: 1200,
    alt: "Responsive fixture", caption: "", credit: "",
    variants: [320, 480, 768, 960, 1440, 1920].map(width => ({
      url: `/media/news/2026/large-w${width}.webp`, width, height: width / 2,
    })),
  };
  it("keeps desktop candidates when 100vw is only the mobile fallback", () => {
    const attrs = articleImageAttrs(largeMedia, { priority: true, sizes: "(min-width: 1024px) calc(100vw - 40rem), 100vw" });
    expect(attrs.srcSet).toContain("960w");
    expect(attrs.srcSet).not.toContain("2400w");
  });
  it("lets article/desktop lead images select every available rung, including high-DPR sizes", () => {
    for (const sizes of ["(min-width: 1024px) calc(100vw - 40rem), 100vw", "(min-width: 1536px) 42vw, (min-width: 1024px) 46vw, 100vw"]) {
      const attrs = articleImageAttrs(largeMedia, { priority: true, resolution: "content", sizes });
      for (const width of [320, 480, 768, 960, 1440, 1920, 2400]) expect(attrs.srcSet).toContain(`${width}w`);
      expect(attrs.src).not.toBe(largeMedia.url);
      expect(attrs.sizes).toBe(sizes);
    }
  });
  it("retains middle sizes for body images without making thumbnails/lite copies fetch masters", () => {
    const body = articleImageAttrs(largeMedia, { resolution: "content", sizes: "760px" });
    expect(body.srcSet).toContain("1440w"); expect(body.srcSet).toContain("2400w");
    expect(articleImageAttrs(largeMedia, { sizes: "112px" }).srcSet).not.toContain("1440w");
    const lite = articleImageAttrs(largeMedia, { resolution: "content", lite: true, sizes: "112px" });
    expect(lite.srcSet).toBeUndefined(); expect(lite.src).toContain("w320");
  });
  it("caps mobile lead srcset at 640w and prefers ≤640 src", () => {
    const media = {
      url: "/media/news/2026/story.webp",
      width: 2000,
      height: 1200,
      alt: "lead",
      caption: "",
      credit: "",
      variants: [
        { url: "/media/news/2026/story-w320.webp", width: 320, height: 192 },
        { url: "/media/news/2026/story-w480.webp", width: 480, height: 288 },
        { url: "/media/news/2026/story-w768.webp", width: 768, height: 461 },
        { url: "/media/news/2026/story-w960.webp", width: 960, height: 576 },
        { url: "/media/news/2026/story-w1440.webp", width: 1440, height: 864 },
      ],
    };
    const attrs = articleImageAttrs(media, { priority: true, sizes: "100vw" });
    expect(attrs.src).toBe("/media/news/2026/story-w480.webp");
    expect(attrs.srcSet).toContain("480w");
    expect(attrs.srcSet).not.toContain("768w");
    expect(attrs.sizes).toBe("100vw");
  });

  it("keeps the 480w rung so small cards do not jump to 768w", () => {
    const set = compactSrcSet(
      "/a 320w, /b 480w, /c 768w, /d 960w, /e 1440w",
      960,
    );
    expect(set).toContain("480w");
    expect(set).toContain("768w");
  });

  it("picks compact mid rungs for cards", () => {
    const set = compactSrcSet(
      "/a 320w, /b 768w, /c 960w, /d 1440w, /e 2000w",
      960,
    );
    expect(set).toBe("/a 320w, /b 768w, /c 960w");
  });

  it("maps sizes to prefer widths", () => {
    expect(preferWidthFromSizes("100vw", 960)).toBe(640);
    expect(preferWidthFromSizes("22vw", 960)).toBe(640);
  });
});
