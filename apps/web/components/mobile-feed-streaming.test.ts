import { PassThrough } from "node:stream";
import { createElement, Suspense, type ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MobileRubricFeed } from "../lib/mobile-rubric-feed";
import { MobileCanonicalFeed } from "./mobile-rubric-feed";

const gate = vi.hoisted(() => ({ kind: "carousel", ready: true, pending: Promise.resolve() }));

// Model an unresolved next/dynamic SSR import. Next's default SSR loadable uses
// React.lazy without its own Suspense boundary, so it throws to its caller.
vi.mock("next/dynamic", () => ({ default: () => function DeferredWidget(props: { articles?: { id: string; path: string; title: string }[] }) {
  const kind = props.articles ? "carousel" : "poll";
  if (gate.kind === kind && !gate.ready) throw gate.pending;
  return createElement("section", { "data-test-dynamic": kind }, props.articles?.map(article => createElement("a", { key: article.id, href: article.path }, article.title)));
} }));
vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) => createElement("a", { href, ...props }, children) }));
vi.mock("@/lib/category-accent", () => import("../lib/category-accent"));
vi.mock("@/lib/format", () => import("../lib/format"));
vi.mock("@/lib/article-image", () => import("../lib/article-image"));
vi.mock("@/lib/mobile-rubric-feed", () => import("../lib/mobile-rubric-feed"));
vi.mock("@/lib/carousel-article", () => import("../lib/carousel-article"));
vi.mock("@/lib/carousel-autoplay", () => import("../lib/carousel-autoplay"));
vi.mock("./category-archive-pagination", () => ({ CategoryArchivePageLink: () => null }));
vi.mock("./category-archive-nav", () => ({ CategoryArchiveNav: () => null }));
vi.mock("./lists", () => ({ CompactList: () => null }));
vi.mock("./home-category-section", () => ({ HomeCategorySection: () => createElement("section", { "data-test-static-tail": true }, "Test-only static tail section") }));
vi.mock("./home-podcast-link", () => ({ HomePodcastLink: () => null }));
vi.mock("./breadcrumbs", () => ({ Breadcrumbs: () => null }));
vi.mock("./logo", () => ({ Logo: () => null }));

const asOfMs = Date.parse("2026-11-23T10:30:00Z");
const category = { id: "test-only-category", slug: "balgariya", name: "Test-only rubric", path: "/balgariya/" };
const story = (id: string) => ({ id, path: `/test-only-${id}/`, title: `Test-only story ${id}`, excerpt: "", authorName: "Fixture", publishedAt: new Date(asOfMs - 60_000).toISOString(), category,
  hero: { url: `/media/test-only-${id}.webp`, width: 640, height: 480, alt: `Fixture ${id}`, caption: "", credit: "" } });
const model: MobileRubricFeed = {
  schemaVersion: 1, canonicalPath: "/", menuVersion: "fixture-menu", contentVersion: "fixture-content", asOfMs, freshUntil: asOfMs + 60_000,
  rubrics: [{ name: "За теб", path: "/" }, { name: category.name, path: category.path }],
  feed: { kind: "home", hero: story("lead"), support: [story("second"), story("third"), story("fourth")],
    latestCarousel: [story("latest-1"), story("latest-2")], focusCarousel: [story("focus-1"), story("focus-2")],
    topicsCarousel: [story("topics-1"), story("topics-2")], voiceCarousel: [story("voice-1"), story("voice-2")],
    main: [{ category, articles: [story("section")], layout: "grid", wide: false }], aside: [],
    poll: { id: "test-only-poll", question: "Test-only question", description: "", startsAt: null, endsAt: null, open: true, adjusted: false, total: 0, options: [] },
  },
};

describe("mobile first-screen streaming", () => {
  it.each(["carousel", "poll"])("flushes the four top stories while a below-fold %s import is pending", async kind => {
    gate.kind = kind; gate.ready = false;
    let release!: () => void;
    gate.pending = new Promise<void>(resolve => { release = resolve; });
    const output = new PassThrough();
    let html = "", shellReady!: () => void;
    const ready = new Promise<void>(resolve => { shellReady = resolve; });
    const errors: unknown[] = [];
    output.on("data", chunk => { html += chunk.toString(); });
    const done = new Promise<void>((resolve, reject) => { output.on("end", resolve); output.on("error", reject); });
    const tree = createElement("html", null, createElement("head"), createElement("body", null,
      createElement(Suspense, { fallback: createElement("p", { id: "page-fallback" }, "Pending page") }, createElement(MobileCanonicalFeed, { model }))));
    const stream = renderToPipeableStream(tree, {
      onShellReady() { stream.pipe(output); shellReady(); }, onError(error) { errors.push(error); },
    });
    await ready;
    await new Promise<void>(resolve => setImmediate(resolve));
    const initialHtml = html;
    gate.ready = true; release();
    await done;

    expect(errors).toEqual([]);
    // React may flush the outer fallback first, then finish that boundary in a
    // later chunk. Its reveal must already be available while widgets are pending.
    const pageRevealed = !initialHtml.includes('id="page-fallback"') || initialHtml.includes('$RC("B:0","S:0")');
    expect(pageRevealed).toBe(true);
    for (const id of ["lead", "second", "third", "fourth"]) {
      expect(initialHtml).toContain(`href="/test-only-${id}/"`);
    }
    expect(initialHtml).not.toContain(`data-test-dynamic="${kind}"`);
    expect(initialHtml).toContain("data-mobile-rubric-model");
    // Ready static sections must stay in the same pending tail, rather than
    // appearing above missing widgets and moving when those widgets resolve.
    const canonicalShell = initialHtml.slice(initialHtml.indexOf("data-mobile-rubric-canonical"), initialHtml.indexOf('<script type="application/json" data-mobile-rubric-model'));
    expect(canonicalShell).toContain('data-mobile-feed-pending="true"');
    expect(canonicalShell).toContain('style="min-height:100svh"');
    expect(canonicalShell).not.toContain("data-test-static-tail");
    expect(canonicalShell).not.toContain("data-test-dynamic");
    expect(canonicalShell).not.toContain("Защото истината");
    expect(html).toContain("data-test-static-tail");
    expect(html.match(/data-test-dynamic="carousel"/g)).toHaveLength(4);
    expect(html.match(/data-test-dynamic="poll"/g)).toHaveLength(1);
    for (const id of ["latest-1", "latest-2", "focus-1", "focus-2", "topics-1", "topics-2", "voice-1", "voice-2"]) {
      expect(html).toContain(`href="/test-only-${id}/"`);
    }
  });
});
