import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptyArrangement } from "@newspoint/content";
import { ArrangeDesk } from "./arrange-desk";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/paths", () => ({ withBase: (path: string) => `/admin${path}` }));

describe("home top-news map", () => {
  it("keeps all four numbers visible with a pinned title and photo", () => {
    const draft = emptyArrangement();
    draft.slots.hero = { items: [{ articleId: "qa-hero", startsAt: null, endsAt: null, placedBy: "QA", placedAt: null }] };
    const html = renderToStaticMarkup(createElement(ArrangeDesk, {
      version: "qa", pageKey: "home", menu: [], draft, note: "", history: [], ready: true,
      articles: { "qa-hero": { id: "qa-hero", title: "QA закачена новина", categoryName: null, isPublic: true, imageUrl: "/media/qa-cover.webp" } },
    }));
    for (const number of [1, 2, 3, 4]) expect(html).toContain(`data-home-position="${number}"`);
    expect(html).toContain('aria-label="Топ 1 · QA закачена новина"');
    expect(html).toContain('src="/media/qa-cover.webp"');
    expect(html).toContain('aria-label="Топ 3 · Малка"');
  });

  it("does not preview unpublished or future queued articles as active pins", () => {
    const draft = emptyArrangement();
    draft.slots.hero = { items: [{ articleId: "qa-private", startsAt: null, endsAt: null, placedBy: "QA", placedAt: null }] };
    draft.slots["support-0"] = { items: [{ articleId: "qa-future", startsAt: "2099-01-01T00:00:00Z", endsAt: null, placedBy: "QA", placedAt: null }] };
    const html = renderToStaticMarkup(createElement(ArrangeDesk, {
      version: "qa", pageKey: "home", menu: [], draft, note: "", history: [], ready: true,
      articles: {
        "qa-private": { id: "qa-private", title: "QA private", categoryName: null, isPublic: false, imageUrl: "/media/qa-private.webp" },
        "qa-future": { id: "qa-future", title: "QA future", categoryName: null, isPublic: true, imageUrl: "/media/qa-future.webp" },
      },
    }));
    expect(html).not.toContain("qa-private.webp");
    expect(html).not.toContain("qa-future.webp");
    expect(html).toContain('aria-label="Топ 1 · Водеща"');
    expect(html).toContain('aria-label="Топ 2 · До водещата"');
  });
});
