import { describe, expect, it } from "vitest";
import { pushFilterMatches } from "@newspoint/db/push-domain";

/** Exercises the shared production filter, including legacy subscriptions. */
function matchesPushFilter(
  row: { categorySlug: string | null; categorySlugs: string[] | null },
  articleSlug: string | null,
): boolean {
  return pushFilterMatches(row.categorySlugs, row.categorySlug, articleSlug);
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
