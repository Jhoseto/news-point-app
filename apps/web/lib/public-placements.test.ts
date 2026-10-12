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
  state.archive.mockImplementation(async (_category, _cursor, options) => ({ articles: state.pool.filter(a => !options.skipIds.includes(a.id)).slice(0, options.limit), anchored: false, previous: null, next: null }));
});
afterEach(() => vi.useRealTimers());

describe("cached listing inputs and placement clocks", () => {
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
    expect(categoryMobileFeed(category, before).freshUntil).toBe(end);
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
