import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArticleSummary } from "../lib/queries";
import { MobileLeadCard, MobileSmallCard, MobileSupportingCard } from "./mobile-home-cards";
import { FeatureCard } from "./article-card";
import { useReducedMotion } from "./reader-preferences";

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) => createElement("a", { href, ...props }, children) }));
vi.mock("@/lib/category-accent", () => import("../lib/category-accent"));
vi.mock("@/lib/format", () => import("../lib/format"));
vi.mock("@/lib/article-image", () => import("../lib/article-image"));
vi.mock("@/lib/shine-style", () => import("../lib/shine-style"));
vi.mock("./reader-preferences", () => ({ useReducedMotion: vi.fn(() => true) }));

const now = new Date("2026-11-23T10:30:00Z");
const article: ArticleSummary = {
  id: "test-only-mobile-story", path: "/test-only-mobile-story/",
  title: "Изрично тестово дълго заглавие, което трябва да остане изцяло в достъпното име и в HTML",
  excerpt: "Изрично тестов откъс за проверка на мобилната начална страница.",
  authorName: "Тестов автор", publishedAt: new Date("2026-11-23T09:15:00Z"),
  category: { id: "test-category", name: "Регион", slug: "regionalni-novini", path: "/regionalni-novini/" },
  hero: {
    url: "/media/news/test-only/image.webp", width: 1200, height: 900, alt: "Изрично тестова снимка", caption: "", credit: "",
    variants: [
      { url: "/media/news/test-only/image-320.webp", width: 320, height: 240 },
      { url: "/media/news/test-only/image-640.webp", width: 640, height: 480 },
    ],
  },
};

afterEach(() => vi.useRealTimers());

describe("mobile homepage card variants", () => {
  it("keeps the full homepage lead headline and accessible link name without a title clamp", () => {
    const html = renderToStaticMarkup(createElement(MobileLeadCard, { article, overlay: true, priority: true, now }));
    expect(html).toContain(`aria-label="${article.title}"`);
    expect(html).toContain(`<h2 class="np-mobile-home-lead-title">${article.title}</h2>`);
    expect(html).toContain('class="np-mobile-home-lead-copy"');
    expect(html).not.toContain("line-clamp-");
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchPriority="high"');
  });

  it("leaves category archive lead and supporting cards on their existing defaults", () => {
    const lead = renderToStaticMarkup(createElement(MobileLeadCard, { article, now }));
    expect(lead).not.toContain("np-mobile-home-lead");
    expect(lead).toContain('class="flex flex-col gap-2 p-4"><h2');
    const supporting = renderToStaticMarkup(createElement(MobileSupportingCard, { article, now }));
    expect(supporting).not.toContain("np-mobile-home-support");
    expect(supporting).toContain("line-clamp-2");
    const featured = renderToStaticMarkup(createElement(MobileSupportingCard, { article, featured: true, now }));
    expect(featured).toContain("np-mobile-home-support");
    expect(featured).toContain("line-clamp-3");
  });

  it("makes carousel copies untabbable and keeps their lite image and exact Sofia clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const html = renderToStaticMarkup(createElement(MobileSmallCard, { article, now, tabbable: false, liteMedia: true, exactTime: true }));
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain(`aria-label="${article.title}"`);
    expect(html).toContain('src="/media/news/test-only/image-640.webp"');
    expect(html).not.toMatch(/srcset=/i);
    expect(html).toContain('dateTime="2026-11-23T09:15:00.000Z"');
    expect(html).toContain("11:15</time>");
    const original = renderToStaticMarkup(createElement(MobileSmallCard, { article, now }));
    expect(original).not.toContain("tabindex=");
    expect(original).toMatch(/srcset=/i);
    expect(original).toContain("преди 1 час");
  });

  it("keeps mobile clamped headings static without subscribing to desktop tooltip preferences", () => {
    vi.mocked(useReducedMotion).mockClear();
    const supporting = renderToStaticMarkup(createElement(MobileSupportingCard, { article, now }));
    const small = renderToStaticMarkup(createElement(MobileSmallCard, { article, now }));
    expect(supporting).toMatch(/<h3 class="line-clamp-2 [^"]+">/);
    expect(small).toMatch(/<h3 class="line-clamp-3 [^"]+">/);
    expect(small).toContain(`>${article.title}</h3>`);
    expect(small).toContain(`aria-label="${article.title}"`);
    expect(useReducedMotion).not.toHaveBeenCalled();
  });

  it("removes the section lead excerpt only when explicitly requested", () => {
    const desktop = renderToStaticMarkup(createElement(FeatureCard, { article }));
    const mobile = renderToStaticMarkup(createElement(FeatureCard, { article, showExcerpt: false }));
    expect(desktop).toContain(article.excerpt);
    expect(mobile).not.toContain(article.excerpt);
    expect(mobile).toContain(article.title);
    expect(mobile).toContain(`href="${article.path}"`);
  });
});
