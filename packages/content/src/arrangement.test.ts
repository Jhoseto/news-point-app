import { describe, expect, it } from "vitest";
import { activePlacement, duplicateArticleIds, emptyArrangement, type ArrangementDocument } from "./arrangement";

const article = "6f1e2c8a-1b2d-4c3e-9a10-111111111111";
const next = "6f1e2c8a-1b2d-4c3e-9a10-222222222222";
const visible = new Set([article, next]);

function document(items: ArrangementDocument["slots"][string]["items"]): ArrangementDocument {
  return { slots: { hero: { items } }, excluded: [] };
}

describe("activePlacement", () => {
  it("keeps a permanent story in the slot", () => {
    const slot = document([{ articleId: article, startsAt: null, endsAt: null, placedBy: "Коце", placedAt: null }]).slots.hero;
    expect(activePlacement(slot, Date.parse("2026-09-29T12:00:00Z"), visible)?.articleId).toBe(article);
  });

  it("stays empty until the start and returns to automatic after the end", () => {
    const slot = document([{
      articleId: article,
      startsAt: "2026-09-29T10:00:00.000Z",
      endsAt: "2026-09-29T12:00:00.000Z",
      placedBy: "Коце",
      placedAt: null,
    }]).slots.hero;
    expect(activePlacement(slot, Date.parse("2026-09-29T09:00:00Z"), visible)).toBeNull();
    expect(activePlacement(slot, Date.parse("2026-09-29T11:00:00Z"), visible)?.articleId).toBe(article);
    expect(activePlacement(slot, Date.parse("2026-09-29T12:00:00Z"), visible)).toBeNull();
  });

  it("moves the queued story into the same slot when the current one ends", () => {
    const slot = document([
      { articleId: article, startsAt: null, endsAt: "2026-09-29T12:00:00.000Z", placedBy: "Коце", placedAt: null },
      { articleId: next, startsAt: null, endsAt: null, placedBy: "Коце", placedAt: null },
    ]).slots.hero;
    expect(activePlacement(slot, Date.parse("2026-09-29T11:00:00Z"), visible)?.articleId).toBe(article);
    expect(activePlacement(slot, Date.parse("2026-09-29T12:00:00Z"), visible)?.articleId).toBe(next);
  });

  it("skips a story that is no longer public", () => {
    const slot = document([
      { articleId: article, startsAt: null, endsAt: null, placedBy: "Коце", placedAt: null },
      { articleId: next, startsAt: null, endsAt: null, placedBy: "Коце", placedAt: null },
    ]).slots.hero;
    expect(activePlacement(slot, Date.parse("2026-09-29T12:00:00Z"), new Set([next]))?.articleId).toBe(next);
  });
});

describe("duplicateArticleIds", () => {
  it("reports a story sitting in two slots at once", () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    const doc: ArrangementDocument = {
      ...emptyArrangement(),
      slots: {
        hero: { items: [{ articleId: article, startsAt: null, endsAt: null, placedBy: "", placedAt: null }] },
        "support-0": { items: [{ articleId: article, startsAt: null, endsAt: null, placedBy: "", placedAt: null }] },
      },
    };
    expect(duplicateArticleIds(doc, now, visible)).toEqual([article]);
  });
});
