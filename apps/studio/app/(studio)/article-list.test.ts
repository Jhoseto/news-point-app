import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import ArticlesPage from "./page";

const fixture = vi.hoisted(() => ({
  id: "00000000-0000-4000-8000-000000000001", title: "QA тестов материал — само за проверка", sourceSystem: "studio", isPublic: false,
  path: "/qa-only/", publishedAt: null, scheduledPublishAt: new Date("2026-11-01T09:00:00Z"), updatedAt: new Date("2026-10-18T09:00:00Z"),
  categoryName: "QA рубрика", authorName: "QA автор", hasUnpublishedChanges: false, readCount: null, addedCount: null,
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: unknown }) => createElement("a", { href, ...props }, children as never) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/article-desk", () => ({ queryArticleDesk: async () => ({ items: [fixture], total: 1, matched: 1, published: 0, drafts: 0, scheduled: 1, changed: 0, shown: 1, page: 1, pageCount: 1 }) }));
vi.mock("@/lib/articles", () => ({ listSections: async () => [{ id: "00000000-0000-4000-8000-000000000002", name: "QA рубрика" }] }));
vi.mock("@/lib/arrangements", () => ({ menuCategories: async () => [] }));
vi.mock("@/lib/users", () => ({ listStaffProfiles: async () => [{ id: "qa-author", name: "QA автор" }] }));
vi.mock("@/lib/format", async () => await import("../../lib/format"));
vi.mock("@/lib/paths", () => ({ withBase: (path: string) => `/admin${path}` }));
vi.mock("@/lib/article-list-query", async () => await import("../../lib/article-list-query"));
vi.mock("@/components/article-filter-form", async () => await import("../../components/article-filter-form"));
vi.mock("@/components/article-desk-preview", () => ({ ArticleDeskPreview: ({ title }: { title: string }) => createElement("span", null, title) }));
vi.mock("@/components/delete-article-button", () => ({ DeleteArticleButton: () => null }));
vi.mock("@/components/place-article", () => ({ PlaceArticle: () => null }));
vi.mock("@/components/article-visibility", () => ({ ArticleVisibility: () => null }));

it("renders five practical fields and all seven sortable headers with state preserved", async () => {
  const html = renderToStaticMarkup(await ArticlesPage({ searchParams: Promise.resolve({ sort: "category", dir: "desc", q: "QA", status: "scheduled", author: "qa-author" }) }));
  expect(html.match(/<select /g)).toHaveLength(3);
  expect(html.match(/<th [^>]*aria-sort=/g)).toHaveLength(7);
  expect(html).toContain('name="sort" value="category"');
  expect(html).toContain('name="dir" value="desc"');
  expect(html).toContain('name="status" value="scheduled"');
  for (const name of ["source", "hero", "date"]) expect(html).not.toContain(`name="${name}"`);
  expect(html).toContain("Променяни от");
  expect(html).toContain("Вчера");
  expect(html).toContain("Насрочени");
  expect(html).toContain("Ще се публикува на 01.11.2026, 11:00.");
  expect(html).toContain('sort=category');
  expect(html).toContain('aria-sort="descending"');
  if (process.env.ARTICLE_DESK_QA_REPORT === "1") {
    mkdirSync("tests/reports/article-desk-20261018", { recursive: true });
    writeFileSync("tests/reports/article-desk-20261018/fixture.html", html);
  }
});
