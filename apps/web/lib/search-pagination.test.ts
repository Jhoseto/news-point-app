import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { filteredSearchUrl, normalizeSearchQuery } from "./search";
import { parseSearchCursor, parseSearchFilters, searchCursorUrl, type SearchCursor } from "./search-pagination";
import { searchArchiveFilter, searchMatches } from "./search-query";

const filters = { query: "Пловдив", category: "plovdiv", period: "7d" as const };
const cursor: SearchCursor = { v: 1, ...filters, anchor: "2026-09-27T08:00:00.123456Z", direction: "older", boundary: { at: "2026-09-26T08:00:00.000123Z", id: "22222222-2222-4222-8222-222222222222" } };
const now = Date.parse("2026-09-27T09:00:00Z");
const raw = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("search filters and navigation", () => {
  it("normalizes NFC/spacing and bounds input; keeps legacy first q semantics", () => {
    expect(normalizeSearchQuery(" и\u0306  Пловдив  ")).toBe("й Пловдив");
    expect(normalizeSearchQuery("а".repeat(100))).toHaveLength(80);
    expect(parseSearchFilters({ q: ["  Пловдив  ", "друго"] })).toEqual({ query: "Пловдив", category: "", period: "all" });
  });
  it.each([{ category: "missing" }, { category: ["plovdiv", "sportni-novini"] }, { period: "year" }, { period: ["7d", "30d"] }])("rejects unsupported and duplicate filters (%#)", params => {
    expect(() => parseSearchFilters(params)).toThrow("Invalid search filters");
  });
  it("preserves filter binding and exact timestamps through forward/back URLs", () => {
    const url = searchCursorUrl(cursor);
    const params = new URL(url, "https://newspoint.bg").searchParams;
    expect(params.get("category")).toBe("plovdiv");
    expect(params.get("period")).toBe("7d");
    expect(parseSearchCursor(params.get("cursor")!, filters, now)).toEqual(cursor);
    expect(filteredSearchUrl({ ...filters, category: "", period: "all" })).not.toContain("cursor");
    expect(parseSearchCursor(undefined, filters, now)).toBeNull();
  });
  it.each(["", "!", "a".repeat(961), [raw(cursor)], raw({ ...cursor, query: "Спорт" }), raw({ ...cursor, category: "" }), raw({ ...cursor, period: "all" }), raw({ ...cursor, anchor: "2027-09-27T08:00:00.000000Z" }), raw({ ...cursor, boundary: { ...cursor.boundary, at: "2026-09-28T08:00:00.000000Z" } })])("rejects malformed or mismatched cursors (%#)", value => {
    expect(() => parseSearchCursor(value, filters, now)).toThrow("Invalid search cursor");
  });
  it("uses category EXISTS, fixed period anchor and bound LIKE terms", () => {
    const category = "11111111-1111-4111-8111-111111111111";
    const query = new PgDialect().sqlToQuery(searchArchiveFilter("Пловдив кмет", cursor.anchor, category, "7d"));
    expect(query.sql).toContain("exists (select 1");
    expect(query.sql).toContain('"articles"."created_at" <=');
    expect(query.sql).toContain("interval '1 millisecond'");
    expect(query.params).toContain(7 * 86_400_000);
    expect(query.params).toContain(category);
    expect(query.params.filter(value => value === "%Пловдив%" || value === "%кмет%")).toHaveLength(4);
    expect(searchMatches("%_ !")).toEqual([]);
  });
});
