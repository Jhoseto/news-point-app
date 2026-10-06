import { describe, expect, it } from "vitest";
import { isChronologicalThemeOrder, sortThemeArticlesChronologically } from "../apps/studio/lib/story-theme-order";

describe("sortThemeArticlesChronologically", () => {
  it("orders from oldest published to newest", () => {
    const items = [
      { id: "c", publishedAt: "2026-10-05T12:00:00.000Z" },
      { id: "a", publishedAt: "2026-03-01T08:15:00.000Z" },
      { id: "b", publishedAt: "2026-03-01T08:15:01.000Z" },
    ];
    expect(sortThemeArticlesChronologically(items).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("puts missing dates last and ties by id", () => {
    const items = [
      { id: "z", publishedAt: null },
      { id: "b", publishedAt: "2026-01-01T00:00:00.000Z" },
      { id: "a", publishedAt: "2026-01-01T00:00:00.000Z" },
    ];
    expect(sortThemeArticlesChronologically(items).map((item) => item.id)).toEqual(["a", "b", "z"]);
  });
});

describe("isChronologicalThemeOrder", () => {
  it("is true when already oldest-to-newest", () => {
    expect(
      isChronologicalThemeOrder([
        { id: "a", publishedAt: "2026-01-01T00:00:00.000Z" },
        { id: "b", publishedAt: "2026-02-01T00:00:00.000Z" },
      ]),
    ).toBe(true);
  });

  it("is false when a newer article sits above an older one", () => {
    expect(
      isChronologicalThemeOrder([
        { id: "b", publishedAt: "2026-02-01T00:00:00.000Z" },
        { id: "a", publishedAt: "2026-01-01T00:00:00.000Z" },
      ]),
    ).toBe(false);
  });
});
