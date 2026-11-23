import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { emptyArrangement, type ArrangementDocument } from "@newspoint/content";
import type { ArticleSummary, CategoryRef } from "./queries";

const state = vi.hoisted(() => ({
  snapshots: new Map<string, unknown>(), document: {} as ArrangementDocument,
  pool: [] as ArticleSummary[], select: vi.fn(), archive: vi.fn(), latest: vi.fn(),
}));
vi.mock("next/cache", () => ({ unstable_cache: (read: (...args: unknown[]) => Promise<unknown>, keys: string[]) => async (...args: unknown[]) => {
  const key = JSON.stringify([keys, args]);
  if (!state.snapshots.has(key)) state.snapshots.set(key, JSON.parse(JSON.stringify(await read(...args))));
  return state.snapshots.get(key);
} }));
vi.mock("@newspoint/db", () => ({
  getDb: () => ({ select: state.select }), hasPageArrangements: async () => true,
  pageArrangements: { document: "document", pageKey: "page_key", status: "status" },
}));
vi.mock("@newspoint/db/polls", () => ({ featuredPoll: async () => null }));
vi.mock("@newspoint/db/podcasts", () => ({
  podcastsReady: async () => true,
  listPublishedPodcastLinks: async () => [{ title: "Test episode", slug: "test-only", coverKey: "podcasts/2026/11/ab.webp", audioKey: "test-only-private-audio.mp3", summary: "Unused fixture summary" }],
}));
vi.mock("./category-grid-balance.server", () => ({
  archiveBoundaryForArticle: async () => null,
  countCategoryArticlesAfter: async () => 0,
}));
vi.mock("./category-archive-pages", () => ({
  getCategoryArchiveTotalPages: async () => 3,
  getCategoryArchivePageHref: async (_category: unknown, _anchor: unknown, page: number) =>
    page === 1 ? "/balgariya/" : `/balgariya/archive/page-${page}/`,
  buildCategoryArchivePageStrip: async () => [{ kind: "current", page: 1 }],
}));
vi.mock("./queries", () => ({
  getLatest: () => state.latest(), getLatest24Hours: async () => state.pool,
  getLabelled: async () => state.pool, getMenuCategories: async () => [category],
  getByCategory: async () => state.pool,
  getSummariesByIds: async (ids: string[]) => new Map(state.pool.filter(a => ids.includes(a.id)).map(a => [a.id, a])),
  publicAsOfMs: (now = Date.now()) => Math.floor(now / 60_000) * 60_000,
  getCategoryArchive: (...args: unknown[]) => state.archive(...args),
}));

import { loadPublicHome } from "./public-home";
import { loadPublicCategory } from "./public-category";
import { categoryMobileFeed, homeMobileFeed } from "./mobile-rubric-feed-server";
import { mobileRubricFeedSchema, reviveFeedArticle, serializeFeedArticle } from "./mobile-rubric-feed";
import { carouselArticle } from "./carousel-article";

const category: CategoryRef = { id: "0f1e2c8a-1b2d-4c3e-9a10-111111111111", slug: "plovdiv", name: "Fixture rubric", path: "/plovdiv/" };
const automaticId = "6f1e2c8a-1b2d-4c3e-9a10-111111111111", pinnedId = "6f1e2c8a-1b2d-4c3e-9a10-222222222222";
const start = Date.parse("2026-10-12T12:00:10Z"), end = start + 500;
const article = (id: string): ArticleSummary => ({ id, path: `/${id}/`, title: "Isolated placement fixture", excerpt: "", authorName: "Fixture", publishedAt: new Date(start - 1000), category, hero: null });
function placement(slot: string, endsAt: number | null, startsAt: number | null = null) {
  state.document = { slots: { [slot]: { items: [{ articleId: pinnedId, startsAt: startsAt === null ? null : new Date(startsAt).toISOString(), endsAt: endsAt === null ? null : new Date(endsAt).toISOString(), placedBy: "Fixture", placedAt: null }] } }, excluded: [] };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(start); state.snapshots.clear(); vi.clearAllMocks();
  state.document = emptyArrangement(); state.pool = [article(automaticId), article(pinnedId)];
  state.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [{ document: state.document }] }) }) }));
  state.latest.mockImplementation(async () => state.pool);
  state.archive.mockImplementation(async (_category, _cursor, options) => ({ articles: state.pool.filter(a => !options.skipIds.includes(a.id)).slice(0, options.limit), anchored: false, previous: null, next: null, anchor: "2026-01-01T00:00:00.000000Z" }));
});
afterEach(() => vi.useRealTimers());

describe("cached listing inputs and placement clocks", () => {
  it("omits unused mobile home prose while preserving every card field that is rendered", async () => {
    const home = await loadPublicHome();
    const fixture = { ...article(automaticId), excerpt: "Fixture excerpt ".repeat(100), hero: {
      url: "/media/news/2026/fixture.webp", width: 1600, height: 1000, alt: "Fixture image", caption: "Fixture caption", credit: "Fixture credit",
      focalPoint: { x: 0.2, y: 0.7 }, variants: [320, 480, 640, 768, 960, 1280].map(width => ({ url: `/media/news/2026/fixture-${width}.webp`, width, height: width * 0.625 })),
    } };
    home.hero = fixture; home.support = [fixture];
    home.focusCarousel = [fixture, { ...fixture, id: pinnedId, hero: null }];
    home.topicsCarousel = [fixture];
    home.voiceCarousel = [fixture];
    const sectionStories = Array.from({ length: 7 }, (_, index) => ({ ...fixture, id: `test-only-section-${index}`, path: `/test-only-section-${index}/`, title: `Test-only section story ${index}` }));
    const section = (slug: string, wide: boolean) => ({ category: { ...category, slug, path: `/${slug}/` }, articles: sectionStories, pool: sectionStories, layout: "feature" as const, wide });
    home.main = [section("plovdiv", true), section("balgariya", false), section("test-only-unrendered-main", false)];
    home.aside = [section("test-only-aside", false)];
    const originalHome = structuredClone(home);
    const previous = home.focusCarousel.map(serializeFeedArticle).map(reviveFeedArticle).map(carouselArticle);
    const model = homeMobileFeed(home, [category]);
    if (model.feed.kind !== "home") throw Error("Wrong fixture feed");
    expect(model.feed.latestPodcast).toEqual({ title: "Test episode", path: "/livepoint/podcast/test-only/", coverUrl: "/media/podcasts/2026/11/ab.webp" });
    expect(model.feed.focusCarousel.map(reviveFeedArticle).map(carouselArticle)).toEqual(previous);
    expect(model.feed.topicsCarousel.map(reviveFeedArticle).map(carouselArticle)).toEqual([previous[0]]);
    expect(model.feed.voiceCarousel.map(reviveFeedArticle).map(carouselArticle)).toEqual([previous[0]]);
    const headlineOnly = { ...serializeFeedArticle(fixture), excerpt: "" };
    expect(model.feed.hero).toEqual(headlineOnly);
    expect(model.feed.support).toEqual([headlineOnly]);
    expect(model.feed.main.map(section => section.category.slug)).toEqual(["plovdiv", "balgariya"]);
    const sectionCards = sectionStories.map(story => ({ ...serializeFeedArticle(story), excerpt: "" }));
    expect(model.feed.main.map(section => section.articles)).toEqual([sectionCards.slice(0, 4), sectionCards.slice(0, 4)]);
    expect(model.feed.aside).toEqual([{ category: home.aside[0]!.category, articles: sectionCards, layout: "feature", wide: false }]);
    expect(JSON.stringify(model.feed.focusCarousel).length).toBeLessThan(JSON.stringify(home.focusCarousel.map(serializeFeedArticle)).length);
    expect(JSON.stringify(model.feed)).not.toContain("Fixture excerpt");
    expect(home).toEqual(originalHome);
    expect(fixture.hero.variants).toHaveLength(6); expect(fixture.excerpt).not.toBe("");
  });
  it("projects only public podcast thumbnail fields and accepts snapshots from before covers were added", async () => {
    const home = await loadPublicHome();
    const episode = { title: "Test episode", path: "/livepoint/podcast/test-only/", coverUrl: "/media/podcasts/2026/11/ab.webp" };
    expect(home.latestPodcast).toEqual(episode);
    const extraPodcastFields = { ...episode, audioUrl: "/test-only-private-audio/", summary: "Unused fixture summary" };
    const model = homeMobileFeed({ ...home, latestPodcast: extraPodcastFields }, [category]);
    if (model.feed.kind !== "home") throw Error("Wrong fixture feed");
    expect(model.feed.latestPodcast).toEqual(episode);
    const legacyEpisode = { title: episode.title, path: episode.path };
    const legacy = homeMobileFeed({ ...home, latestPodcast: legacyEpisode }, [category]);
    expect(legacy.feed.kind === "home" && legacy.feed.latestPodcast).toEqual(legacyEpisode);
    expect(mobileRubricFeedSchema.safeParse(JSON.parse(JSON.stringify(legacy))).success).toBe(true);
    expect(model.contentVersion).not.toBe(legacy.contentVersion);
    const withPodcast = (latestPodcast: unknown) => ({ ...model, feed: { ...model.feed, latestPodcast } });
    expect(mobileRubricFeedSchema.safeParse(withPodcast({ ...episode, coverUrl: "javascript:alert(1)" })).success).toBe(false);
    expect(mobileRubricFeedSchema.safeParse(withPodcast(extraPodcastFields)).success).toBe(false);
  });
  it("preserves the category feed projection, including excerpts, independently of home", async () => {
    state.pool = Array.from({ length: 7 }, (_, index) => ({ ...article(`${automaticId.slice(0, -1)}${index}`), excerpt: "Test-only archive excerpt" }));
    const view = await loadPublicCategory(category, null);
    const model = categoryMobileFeed(category, view, null);
    if (model.feed.kind !== "category") throw Error("Wrong fixture feed");
    expect(model.feed.articles).toEqual(view.articles.map(serializeFeedArticle));
    expect(model.feed.articles).toHaveLength(7);
    expect(model.feed.articles[0]?.excerpt).toBe("Test-only archive excerpt");
  });
  it("restores the homepage's automatic order at the exact end within one cached minute", async () => {
    placement("hero", end);
    const before = await loadPublicHome();
    expect(before.hero?.id).toBe(pinnedId); expect(before.nextChangeAt).toBe(end);
    expect(homeMobileFeed(before, [category]).freshUntil).toBe(end);
    vi.setSystemTime(end);
    const after = await loadPublicHome();
    expect(after.hero?.id).toBe(automaticId); expect(after.nextChangeAt).toBeNull();
    expect(after.support.some(a => a.id === pinnedId)).toBe(true);
    expect(after.hero?.publishedAt).toBeInstanceOf(Date);
    expect(state.latest).toHaveBeenCalledTimes(1); expect(state.select).toHaveBeenCalledTimes(1);
  });
  it("activates a scheduled start from the same cached source pools", async () => {
    placement("hero", null, end);
    expect((await loadPublicHome()).hero?.id).toBe(automaticId);
    vi.setSystemTime(end); expect((await loadPublicHome()).hero?.id).toBe(pinnedId);
    expect(state.latest).toHaveBeenCalledTimes(1);
  });
  it("releases a category pin and queries its automatic order without stale skip ids", async () => {
    placement("lead", end);
    const before = await loadPublicCategory(category, null);
    expect(before.articles.map(a => a.id)).toEqual([pinnedId, automaticId]);
    expect(before.front.pins[0]?.publishedAt).toBeInstanceOf(Date);
    expect(categoryMobileFeed(category, before, null).freshUntil).toBe(end);
    vi.setSystemTime(end);
    const after = await loadPublicCategory(category, null);
    expect(after.articles.map(a => a.id)).toEqual([automaticId, pinnedId]);
    expect(after.front.pinnedIds).toEqual([]); expect(after.nextChangeAt).toBeNull();
    expect(state.select).toHaveBeenCalledTimes(1);
    expect(state.archive.mock.calls[1]?.[2].skipIds).toEqual([]);
  });
  it("keeps permanent placement and never refreshes an anchored archive for slot expiry", async () => {
    placement("lead", null);
    const before = await loadPublicCategory(category, null);
    vi.setSystemTime(end);
    expect((await loadPublicCategory(category, null)).articles[0]?.id).toBe(pinnedId);
    expect(before.nextChangeAt).toBeNull();
    placement("lead", end + 1000); state.snapshots.clear();
    const timestamp = "2026-10-12T12:00:10.000000Z";
    const archive = await loadPublicCategory(category, { v: 1, category: category.id, anchor: timestamp,
      direction: "older", boundary: { at: timestamp, id: automaticId } });
    expect(archive.nextChangeAt).toBeNull(); expect(archive.articles.some(a => a.id === pinnedId)).toBe(false);
  });
});
