import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { discoveryRobots, llmsText } from "../../apps/web/lib/discovery";
import { PUBLIC_SEO_PAGES, publicMetadata, publicPageMetadata } from "../../apps/web/lib/public-metadata";
import { absoluteMedia, shareCard, shareOrigin } from "../../apps/web/lib/share-card";
import { parseSitemapFile, sitemapFiles, sitemapIndexXml, sitemapXml } from "../../apps/web/lib/sitemap-xml";
import { publicAuthorAnchor } from "../../apps/web/lib/public-team";

// Resolve the existing web dependency; the audit needs no separate sharp install.
const sharp = createRequire(new URL("../../apps/web/package.json", import.meta.url))("sharp");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("machine discovery", () => {
  it("uses only approved names or a matching public author identity, without fuzzy guesses", () => {
    expect(publicAuthorAnchor("  ПЕТЪР   ГЕОРГИЕВ ")).toBe("team-petar");
    expect(publicAuthorAnchor("Петър Георгиев", { id: "different-id", name: "Петър Георгиев" })).toBe("team-petar");
    expect(publicAuthorAnchor("Fixture author", { id: "public-fixture-id", name: "Fixture author" })).toBe("public-fixture-id");
    expect(publicAuthorAnchor("Fixture author")).toBeUndefined();
    expect(publicAuthorAnchor("Fixture author", { id: "different-id", name: "Different author" })).toBeUndefined();
    expect(publicAuthorAnchor("П. Георгиев")).toBeUndefined();
  });
  it("includes original publication dates and editorial excerpts, with no invented or executable markdown", () => {
    const result = llmsText("https://example.test", [{ path: "/fixture/", title: "Fixture", publishedAt: new Date("2026-10-01T10:00:00Z"), excerpt: "Actual fixture excerpt\n## [text](https://example.test) <script>" }, { path: "/unknown/", title: "Unknown", publishedAt: new Date(NaN), excerpt: "" }], []);
    expect(result).toContain("Публикувано: 2026-10-01T10:00:00.000Z.");
    expect(result).toContain("Actual fixture excerpt ## \\[text\\](https://example.test) \\<script\\>");
    expect(result).not.toContain("\n## [text]");
    expect(result).not.toContain("Invalid Date");
    expect(result).toContain("- [Unknown](<https://example.test/unknown/>)\n");
  });
  it("allows crawlers to see public noindex but excludes private endpoints", () => {
    expect(discoveryRobots("https://example.test")).toEqual({ rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/", "/draft/"] }, sitemap: "https://example.test/sitemap.xml" });
  });
  it("links only supplied publications, escapes titles and uses the current host", () => {
    const result = llmsText("https://example.test", [{ path: "/fixture/", title: "Тест [само fixture]\nзаглавие" }], []);
    expect(result).toContain("Тест \\[само fixture\\] заглавие");
    expect(result).toContain("<https://example.test/fixture/>");
    expect(result).toContain("<https://example.test/sitemap.xml>");
    expect(result).not.toContain("## Публикувани теми");
  });
});

describe("public metadata", () => {
  it("rejects malformed canonical origins without including credentials in errors", () => {
    for (const value of ["not-a-url", "ftp://example.test", "https://user:secret@example.test", "https://example.test/subpath", "https://example.test/?x=1"]) {
      vi.stubEnv("WEB_URL", value);
      expect(() => shareOrigin()).toThrow(/WEB_URL must/);
    }
  });
  it("uses the configured host consistently and supplies unique page metadata", () => {
    vi.stubEnv("WEB_URL", "https://preview.example///");
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const key of Object.keys(PUBLIC_SEO_PAGES) as (keyof typeof PUBLIC_SEO_PAGES)[]) {
      const page = PUBLIC_SEO_PAGES[key];
      const metadata = publicPageMetadata(key);
      expect(metadata.alternates?.canonical).toBe(`https://preview.example${page.path}`);
      expect(metadata.openGraph).toMatchObject({ url: `https://preview.example${page.path}`, title: page.title, description: page.description, images: [{ url: `https://preview.example/share/page/${key}/`, width: 1200, height: 630 }] });
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image", description: page.description });
      titles.add(page.title);
      descriptions.add(page.description);
    }
    expect(titles.size).toBe(Object.keys(PUBLIC_SEO_PAGES).length);
    expect(descriptions.size).toBe(titles.size);
    expect(publicPageMetadata("home").title).toEqual({ absolute: PUBLIC_SEO_PAGES.home.title });
  });
  it("keeps external images intact and avoids empty descriptions", () => {
    expect(absoluteMedia("https://images.example/photo.jpg", "https://preview.example")).toBe("https://images.example/photo.jpg");
    const metadata = publicMetadata({ title: "Реално заглавие", description: "  ", path: "/temi/example/", imagePath: "/share/theme/example/" });
    expect(metadata.description).toBe("Реално заглавие");
  });
});

describe("share image fallback", () => {
  it("returns a 1200x630 PNG if the photo endpoint responds with invalid image bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Unavailable photo</html>")));
    const png = await shareCard({ title: "Тестова карта, само в изолирания тест", kicker: "Fixture", color: "#5b6cff", imageUrl: "https://example.test/fixture.jpg" });
    expect(await sharp(png).metadata()).toMatchObject({ width: 1200, height: 630, format: "png" });
  });
});

describe("sitemap pagination", () => {
  it("splits recent news at 1000 entries and preserves full titles with real publication dates", () => {
    expect(sitemapFiles({ articles: 0, themes: 0, podcasts: 0, news: 1001 })).toEqual(["pages.xml", "news-0.xml", "news-1.xml"]);
    expect(parseSitemapFile("news-1.xml")).toEqual({ kind: "news", page: 1 });
    const title = "A & B <news> ".repeat(15);
    const xml = sitemapXml("https://example.test", [{ path: "/fixture/", news: { title, publishedAt: "2026-10-08T09:00:00+03:00" } }]);
    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(xml).toContain("<news:publication_date>2026-10-08T06:00:00.000Z</news:publication_date>");
    expect(xml).toContain(`<news:title>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</news:title>`);
    expect(sitemapXml("https://example.test", [{ path: "/fixture/" }])).not.toContain("news:news");
  });
  it("includes the entire archive above the former 45k ceiling and exact boundaries", () => {
    const files = sitemapFiles({ articles: 45001, themes: 10000, podcasts: 10001 });
    expect(files).toEqual(["pages.xml", "articles-0.xml", "articles-1.xml", "articles-2.xml", "articles-3.xml", "articles-4.xml", "themes-0.xml", "podcasts-0.xml", "podcasts-1.xml"]);
    expect(sitemapFiles({ articles: 0, themes: 0, podcasts: 0 })).toEqual(["pages.xml"]);
  });
  it("rejects malformed, negative and unsafe offsets", () => {
    for (const file of ["articles--1.xml", "articles-01.xml", "articles-9007199254740992.xml", "drafts-0.xml", "articles-1.xml/", "articles-1.5.xml"]) expect(parseSitemapFile(file)).toBeNull();
    expect(parseSitemapFile("themes-2.xml")).toEqual({ kind: "themes", page: 2 });
  });
  it("escapes URLs in both XML formats and serializes cached string timestamps", () => {
    expect(sitemapIndexXml("https://example.test", ["articles-0.xml"])).toContain("<loc>https://example.test/sitemaps/articles-0.xml</loc>");
    const xml = sitemapXml("https://example.test", [{ path: "/a&b/", updatedAt: "2026-10-08T12:00:00Z" }]);
    expect(xml).toContain("<loc>https://example.test/a&amp;b/</loc>");
    expect(xml).toContain("<lastmod>2026-10-08T12:00:00.000Z</lastmod>");
  });
});
