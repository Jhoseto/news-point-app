import { expect, it } from "vitest";
import { ARTICLE_SORTS, articleListHref, articleSortHref, likePattern, pageWindow, parseArticleListQuery, shiftIsoDate, sofiaDayStart, sofiaToday } from "./article-list-query";

it("keeps a safe default desk query", () => {
  const query = parseArticleListQuery({});
  expect(query).toMatchObject({ q: "", status: "all", sort: "updated", dir: "desc", page: 1, pageSize: 50, category: "" });
});

it("rejects junk and clamps the list query", () => {
  const query = parseArticleListQuery({
    q: "  акциз  ",
    status: "nope",
    source: "studio",
    hero: "without",
    category: "not-a-uuid",
    sort: "title",
    page: "-4",
    size: "1000",
    from: "2026-09-28",
    to: "2026-01-02",
  });
  expect(query.q).toBe("акциз");
  expect(query.status).toBe("all");
  expect(query).not.toHaveProperty("source");
  expect(query).not.toHaveProperty("hero");
  expect(query.category).toBe("");
  expect(query.sort).toBe("title");
  expect(query.dir).toBe("asc");
  expect(query.page).toBe(1);
  expect(query.pageSize).toBe(50);
  expect(query.from).toBe("2026-01-02");
  expect(query.to).toBe("2026-09-28");
});

for (const sort of ARTICLE_SORTS) {
  it(`toggles ${sort} in both directions, preserving filters and resetting pagination`, () => {
    const initial = parseArticleListQuery({ q: "QA", author: "newsroom", status: "scheduled", from: "2026-10-01", page: "4", size: "25" });
    const parseHref = (href: string) => parseArticleListQuery(Object.fromEntries(new URL(href, "http://qa.invalid").searchParams));
    const first = parseHref(articleSortHref(initial, sort));
    const second = parseHref(articleSortHref(first, sort));
    const third = parseHref(articleSortHref(second, sort));
    expect(first).toMatchObject({ q: "QA", author: "newsroom", status: "scheduled", from: "2026-10-01", pageSize: 25, sort, page: 1 });
    expect(second.dir).not.toBe(first.dir);
    expect(third).toEqual(first);
  });
}

it("ignores removed filters from old URLs and rejects impossible calendar days", () => {
  const query = parseArticleListQuery({ source: "wordpress", hero: "without", date: "published", from: "2026-02-31", to: "2026-13-01" });
  expect(query.from).toBe("");
  expect(query.to).toBe("");
  expect(articleListHref(query)).toBe("/");
});

it("builds a shareable href and drops defaults", () => {
  const query = parseArticleListQuery({ status: "draft", q: "пловдив", page: "3" });
  expect(articleListHref(query)).toBe("/?q=%D0%BF%D0%BB%D0%BE%D0%B2%D0%B4%D0%B8%D0%B2&status=draft&page=3");
  expect(articleListHref(query, { status: "all", page: 1 })).toBe("/?q=%D0%BF%D0%BB%D0%BE%D0%B2%D0%B4%D0%B8%D0%B2");
});

it("escapes like wildcards", () => {
  expect(likePattern("  100%_готов\\  ")).toBe("%100\\%\\_готов\\\\%");
  expect(likePattern("   ")).toBeNull();
});

it("places Sofia midnight on the same calendar day", () => {
  const start = sofiaDayStart("2026-01-15");
  const summer = sofiaDayStart("2026-07-15");
  expect(start?.toISOString()).toBe("2026-01-14T22:00:00.000Z");
  expect(summer?.toISOString()).toBe("2026-07-14T21:00:00.000Z");
  expect(sofiaDayStart("2026-02-31")).toBeNull();
  expect(shiftIsoDate("2026-03-01", -1)).toBe("2026-02-28");
  expect(sofiaToday(new Date("2026-09-28T21:30:00.000Z"))).toBe("2026-09-29");
});

it("windows the pager around the current page", () => {
  expect(pageWindow(1, 1)).toEqual([1]);
  expect(pageWindow(6, 20)).toEqual([1, "gap", 4, 5, 6, 7, 8, "gap", 20]);
});
