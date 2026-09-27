import { describe, expect, it } from "vitest";
import { UniquePicker } from "./pick";
import type { ArticleSummary } from "./queries";

const article = (id: string): ArticleSummary => ({
  id,
  path: `/${id}/`,
  title: id,
  excerpt: "",
  authorName: "NewsPoint.bg",
  publishedAt: new Date("2026-09-24T00:00:00Z"),
  category: null,
  hero: null,
});

describe("UniquePicker", () => {
  it("never hands out the same article twice", () => {
    const picker = new UniquePicker();
    const pool = ["a", "b", "c", "d"].map(article);
    expect(picker.take(pool, 2).map((a) => a.id)).toEqual(["a", "b"]);
    expect(picker.take(pool, 3).map((a) => a.id)).toEqual(["c", "d"]);
    expect(picker.take(pool, 1)).toEqual([]);
  });
});
