import { emptyArrangement, type ArrangementDocument } from "@newspoint/content";
import { describe, expect, it } from "vitest";
import { composeHome, composeLabelCarousel } from "./home-compose";
import { UniquePicker } from "./pick";
import type { ArticleSummary, CategoryRef } from "./queries";

function category(slug: string): CategoryRef {
  return { id: slug, slug, name: slug, path: `/${slug}/` };
}

function article(id: string, rubric = "plovdiv"): ArticleSummary {
  return {
    id,
    path: `/${id}/`,
    title: id,
    excerpt: "",
    authorName: "NewsPoint.bg",
    publishedAt: new Date("2026-09-29T08:00:00Z"),
    category: category(rubric),
    hero: null,
  };
}

const menu = ["plovdiv", "regionalni-novini", "lajfstajl", "kultura"].map((slug) => category(slug));

describe("composeHome", () => {
  const latest = [article("h1"), article("h2"), article("a1", "regionalni-novini")];
  const featured = [article("f1"), article("f2"), article("f3"), article("f4")];
  const sections = menu.map((entry) => ({ category: entry, pool: [article(`${entry.slug}-1`, entry.slug), article(`${entry.slug}-2`, entry.slug)] }));

  function legacyIds() {
    const picker = new UniquePicker();
    const menuIds = new Set(menu.map((entry) => entry.id));
    const [hero] = picker.take(latest.filter((item) => item.category && menuIds.has(item.category.id)), 1);
    const leading = [...picker.take(featured, 13)];
    leading.push(...picker.take(latest, 13 - leading.length));
    const support = leading.splice(0, 3);
    const carousel = leading.slice(0, 10);
    return { hero: hero?.id, support: support.map((item) => item.id), carousel: carousel.map((item) => item.id) };
  }

  it("matches the automatic homepage when nothing is placed", () => {
    const composed = composeHome({
      latest,
      latest24h: latest,
      featured,
      sections,
      menuIds: new Set(menu.map((entry) => entry.id)),
      pinned: new Map(),
      document: emptyArrangement(),
      now: Date.parse("2026-09-29T12:00:00Z"),
    });
    const legacy = legacyIds();
    expect(composed.hero?.id).toBe(legacy.hero);
    expect(composed.support.map((item) => item.id)).toEqual(legacy.support);
    expect(composed.carousel.map((item) => item.id)).toEqual(legacy.carousel);
    expect(composed.main.map((section) => section.category.slug)).toEqual(["plovdiv", "regionalni-novini"]);
    expect(composed.aside.map((section) => section.category.slug)).toEqual(["kultura", "lajfstajl"]);
    expect(composed.main[0]?.articles).toHaveLength(2);
  });

  it("does not pull „На Фокус“ carousel pins into the hero support row", () => {
    const pinned = article("focus-pin");
    const document: ArrangementDocument = {
      slots: {
        "carousel-0": { items: [{ articleId: pinned.id, startsAt: null, endsAt: null, placedBy: "", placedAt: null }] },
        "support-0": { items: [{ articleId: "support-pin", startsAt: null, endsAt: null, placedBy: "", placedAt: null }] },
      },
      excluded: [],
    };
    const composed = composeHome({
      latest,
      latest24h: latest,
      featured,
      sections,
      menuIds: new Set(menu.map((entry) => entry.id)),
      pinned: new Map([[pinned.id, pinned], ["support-pin", article("support-pin")]]),
      document,
      now: Date.parse("2026-09-29T12:00:00Z"),
    });
    expect(composed.support[0]?.id).toBe("support-pin");
    expect(composed.support.map((item) => item.id)).not.toContain("focus-pin");
  });

  it("keeps a permanent lead in place when a newer story arrives", () => {
    const pinned = article("old");
    const document: ArrangementDocument = {
      slots: { hero: { items: [{ articleId: pinned.id, startsAt: null, endsAt: null, placedBy: "Коце", placedAt: null }] } },
      excluded: [],
    };
    const composed = composeHome({
      latest: [article("newer"), ...latest],
      latest24h: latest,
      featured,
      sections,
      menuIds: new Set(menu.map((entry) => entry.id)),
      pinned: new Map([[pinned.id, pinned]]),
      document,
      now: Date.parse("2026-09-29T12:00:00Z"),
    });
    expect(composed.hero?.id).toBe("old");
    expect(composed.support.map((item) => item.id)).not.toContain("old");
  });

  it("fills the focus carousel from a label pool and respects carousel slot pins", () => {
    const pool = [article("a1"), article("a2"), article("a3")];
    const pinned = article("pinned");
    const document: ArrangementDocument = {
      slots: { "carousel-0": { items: [{ articleId: pinned.id, startsAt: null, endsAt: null, placedBy: "", placedAt: null }] } },
      excluded: [],
    };
    const list = composeLabelCarousel({
      pool,
      document,
      pinned: new Map([[pinned.id, pinned]]),
      now: Date.parse("2026-09-29T12:00:00Z"),
      slotCount: 2,
      maxArticles: 3,
    });
    expect(list.map((item) => item.id)).toEqual(["pinned", "a1", "a2"]);
  });

  it("uses a separate slot prefix for another label carousel", () => {
    const pool = [article("a1"), article("a2"), article("a3")];
    const pinned = article("pinned");
    const document: ArrangementDocument = {
      slots: { "top-temi-0": { items: [{ articleId: pinned.id, startsAt: null, endsAt: null, placedBy: "", placedAt: null }] } },
      excluded: [],
    };
    const list = composeLabelCarousel({
      pool,
      document,
      pinned: new Map([[pinned.id, pinned]]),
      now: Date.parse("2026-09-29T12:00:00Z"),
      slotPrefix: "top-temi",
      slotCount: 2,
      maxArticles: 3,
    });
    expect(list.map((item) => item.id)).toEqual(["pinned", "a1", "a2"]);
  });

  it("drops the lead after its time and pins the latest column without removing the real list", () => {
    const pinned = article("pinned-latest");
    const document: ArrangementDocument = {
      slots: {
        hero: { items: [{ articleId: "old", startsAt: null, endsAt: "2026-09-29T10:00:00.000Z", placedBy: "", placedAt: null }] },
        "latest-0": { items: [{ articleId: pinned.id, startsAt: null, endsAt: null, placedBy: "", placedAt: null }] },
      },
      excluded: [],
    };
    const composed = composeHome({
      latest,
      latest24h: [article("h1"), pinned],
      featured,
      sections,
      menuIds: new Set(menu.map((entry) => entry.id)),
      pinned: new Map([["old", article("old")], [pinned.id, pinned]]),
      document,
      now: Date.parse("2026-09-29T12:00:00Z"),
    });
    expect(composed.hero?.id).toBe("h1");
    expect(composed.latest.map((item) => item.id)).toEqual(["pinned-latest", "h1"]);
  });
});
