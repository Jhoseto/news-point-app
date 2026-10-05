import { describe, expect, it } from "vitest";

/** Mirrors notifyArticlePublished filter in push.ts */
function matchesPushFilter(
  row: { categorySlug: string | null; categorySlugs: string[] | null },
  articleSlug: string | null,
): boolean {
  const multi = row.categorySlugs;
  if (Array.isArray(multi) && multi.length > 0) {
    return Boolean(articleSlug && multi.includes(articleSlug));
  }
  if (row.categorySlug) return row.categorySlug === articleSlug;
  return true;
}

describe("matchesPushFilter", () => {
  it("allows all when no filters", () => {
    expect(matchesPushFilter({ categorySlug: null, categorySlugs: null }, "plovdiv")).toBe(true);
  });

  it("uses multi slug list when present", () => {
    expect(matchesPushFilter({ categorySlug: null, categorySlugs: ["plovdiv"] }, "plovdiv")).toBe(true);
    expect(matchesPushFilter({ categorySlug: null, categorySlugs: ["plovdiv"] }, "politika")).toBe(false);
  });

  it("falls back to legacy single slug", () => {
    expect(matchesPushFilter({ categorySlug: "plovdiv", categorySlugs: null }, "plovdiv")).toBe(true);
    expect(matchesPushFilter({ categorySlug: "plovdiv", categorySlugs: null }, "politika")).toBe(false);
  });
});
