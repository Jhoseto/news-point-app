import { describe, expect, it, vi } from "vitest";
import { CATEGORY_GRID_COLS, categoryGridOrphanCount, trimCategoryGridOrphans } from "./category-grid-balance";

describe("categoryGridOrphanCount", () => {
  it("counts incomplete grid rows after the lead card", () => {
    expect(CATEGORY_GRID_COLS).toBe(4);
    expect(categoryGridOrphanCount(1)).toBe(0);
    expect(categoryGridOrphanCount(5)).toBe(0);
    expect(categoryGridOrphanCount(6)).toBe(1);
    expect(categoryGridOrphanCount(30)).toBe(1);
    expect(categoryGridOrphanCount(29)).toBe(0);
  });
});

describe("trimCategoryGridOrphans", () => {
  const items = Array.from({ length: 30 }, (_, index) => ({ id: `a-${index}` }));

  it("trims trailing orphans when another full row exists on the next page", async () => {
    const trimmed = await trimCategoryGridOrphans(items, {
      hasNext: true,
      boundaryFor: async () => ({ id: "a-28", at: "2026-01-01T00:00:00.000000Z" }),
      countFollowing: async () => CATEGORY_GRID_COLS,
    });
    expect(trimmed).toHaveLength(29);
    expect(trimmed.at(-1)?.id).toBe("a-28");
  });

  it("keeps orphans on the last short page", async () => {
    const trimmed = await trimCategoryGridOrphans(items, {
      hasNext: true,
      boundaryFor: async () => ({ id: "a-28", at: "2026-01-01T00:00:00.000000Z" }),
      countFollowing: async () => 2,
    });
    expect(trimmed).toHaveLength(30);
  });

  it("does not trim when there is no next page", async () => {
    const countFollowing = vi.fn(async () => CATEGORY_GRID_COLS);
    const trimmed = await trimCategoryGridOrphans(items, {
      hasNext: false,
      boundaryFor: async () => ({ id: "a-28", at: "2026-01-01T00:00:00.000000Z" }),
      countFollowing,
    });
    expect(trimmed).toHaveLength(30);
    expect(countFollowing).not.toHaveBeenCalled();
  });
});
