import { describe, expect, it } from "vitest";
import { carouselArticle } from "./carousel-article";
import { articleImageAttrs } from "./article-image";
import { imagePresentation } from "@newspoint/content";
import type { ArticleSummary } from "./queries";

const article: ArticleSummary = {
  id: "article", path: "/article/", title: "Проверено заглавие", excerpt: "Unused carousel excerpt",
  authorName: "Редакцията", publishedAt: new Date("2026-10-01T12:00:00Z"),
  category: { id: "category", name: "Пловдив", slug: "plovdiv", path: "/plovdiv/" },
  hero: { url: "/media/news/2026/image.webp", width: 1600, height: 1000, alt: "Оригинален alt",
    caption: "Unused caption", credit: "Unused credit", focalPoint: { x: 0.2, y: 0.7 },
    variants: [{ url: "/media/news/2026/image-w320.webp", width: 320, height: 200 },
      { url: "/media/news/2026/image-w640.webp", width: 640, height: 400 },
      { url: "/media/news/2026/image-w960.webp", width: 960, height: 600 }] },
};
describe("carousel public props", () => {
  it("keeps the exact lite image, intrinsic geometry, focal point and visible text", () => {
    const result = carouselArticle(article), opts = { lite: true, sizes: "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" };
    expect(articleImageAttrs(result.hero!, opts)).toEqual(articleImageAttrs(article.hero!, opts));
    expect(imagePresentation(result.hero!).objectPosition).toBe(imagePresentation(article.hero!).objectPosition);
    expect(result.hero!.width).toBe(article.hero!.width); expect(result.hero!.height).toBe(article.hero!.height);
    for (const field of ["id", "path", "title", "authorName", "publishedAt", "category"] as const) expect(result[field]).toEqual(article[field]);
    expect(result.hero!.alt).toBe(article.hero!.alt);
    expect(result.hero!.variants).toBeUndefined(); expect(result.excerpt).toBe("");
    expect(JSON.stringify(result).length).toBeLessThan(JSON.stringify(article).length);
    expect(article.hero!.variants).toHaveLength(3);
  });
  it("retains null-image cards and never drops articles", () => {
    const input = [{ ...article, hero: null }, article];
    const results = input.map(carouselArticle);
    expect(results).toHaveLength(2); expect(results[0]!.hero).toBeNull();
  });
});
