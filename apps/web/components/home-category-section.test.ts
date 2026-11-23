import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ArticleSummary } from "../lib/queries";
import { HomeCategorySection } from "./home-category-section";

vi.mock("@/lib/shine-style", () => import("../lib/shine-style"));
vi.mock("./ui", () => ({
  SectionTitle: ({ id, href, children }: { id: string; href: string; children: ReactNode }) =>
    createElement("h2", { id }, createElement("a", { href }, children)),
}));
vi.mock("./article-card", () => {
  const card = (kind: string) => ({ article, showExcerpt = false }: { article: ArticleSummary; showExcerpt?: boolean }) =>
    createElement("article", { "data-card": kind }, createElement("a", { href: article.path }, article.title),
      showExcerpt ? createElement("p", null, article.excerpt) : null);
  return { ArticleCard: card("article"), CompactCard: card("compact"), FeatureCard: card("feature"), HeroCard: card("hero") };
});

const category = { id: "test-only-region", name: "Тестова рубрика", slug: "test-only-region", path: "/test-only-region/" };
const articles: ArticleSummary[] = Array.from({ length: 7 }, (_, index) => ({
  id: `test-only-story-${index}`, path: `/test-only-story-${index}/`, title: `Тестова новина ${index}`,
  excerpt: `Тестов откъс ${index}`, authorName: "Тестов автор", publishedAt: new Date("2026-11-23T09:00:00Z"),
  category, hero: null,
}));
const render = (props: Partial<Parameters<typeof HomeCategorySection>[0]> = {}) =>
  renderToStaticMarkup(createElement(HomeCategorySection, { category, articles, layout: "grid", wide: true, ...props }));
const storyLinks = (html: string) => [...html.matchAll(/href="(\/test-only-story-\d+\/)"/g)].map(match => match[1]);

describe("exclusive mobile category sections", () => {
  it.each([true, false])("renders the same four visible mosaic stories without hidden desktop duplicates (wide=%s)", wide => {
    const selected = wide ? articles : articles.slice(0, 5);
    const desktop = render({ wide, articles: selected });
    const mobile = render({ wide, articles: selected, mobileOnly: true });
    expect(storyLinks(desktop)).toEqual([selected[0]!.path, ...selected.map(article => article.path)]);
    expect(desktop).toContain('data-card="hero"');
    expect(storyLinks(mobile)).toEqual(selected.slice(0, 4).map(article => article.path));
    expect(mobile).not.toContain('data-card="hero"');
    expect(mobile).toContain("grid-cols-1 gap-5 sm:grid-cols-2");
    expect(mobile).toContain(`href="${category.path}"`);
    expect(mobile).toContain(`aria-labelledby="sec-${category.slug}"`);
    expect(render({ wide, articles: selected, mobileOnly: false })).toBe(desktop);
  });

  it("keeps the feature and first three compact stories, with the requested excerpt behavior", () => {
    const desktop = render({ layout: "feature" });
    const mobile = render({ layout: "feature", mobileOnly: true, showLeadExcerpt: false });
    expect(storyLinks(desktop)).toEqual(articles.map(article => article.path));
    expect(desktop).toContain(articles[0]!.excerpt);
    expect(storyLinks(mobile)).toEqual(articles.slice(0, 4).map(article => article.path));
    expect(mobile).toContain('data-card="feature"');
    expect(mobile.match(/data-card="compact"/g)).toHaveLength(3);
    expect(mobile).not.toContain(articles[0]!.excerpt);
  });

  it("preserves a short grid and an empty section exactly", () => {
    const short = articles.slice(0, 3);
    expect(render({ articles: short, mobileOnly: true })).toBe(render({ articles: short }));
    expect(render({ articles: [], mobileOnly: true })).toBe("");
  });
});
