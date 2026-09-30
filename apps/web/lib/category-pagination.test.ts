import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { CATEGORY_PAGE_SIZE, categoryCursorUrl, parseCategoryCursor, type CategoryCursor } from "./category-pagination";
import { archiveBoundary, archiveFilter, archiveOrder } from "./category-archive-query";

const category = "11111111-1111-4111-8111-111111111111";
const cursor: CategoryCursor = {
  v: 1, category, anchor: "2026-09-27T08:00:00.123456Z", direction: "older",
  boundary: { at: "2026-09-26T08:00:00.000123Z", id: "22222222-2222-4222-8222-222222222222" },
};
const now = Date.parse("2026-09-27T09:00:00Z");
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("category archive navigation", () => {
  it("keeps microsecond precision, category, direction and anchor in the URL", () => {
    const url = categoryCursorUrl("/bulgaria/", cursor);
    const token = new URL(url, "https://newspoint.bg").pathname.split("/").filter(Boolean).at(-1);
    expect(url).toBe(`/bulgaria/archive/${token}/`);
    expect(parseCategoryCursor(token, category, now)).toEqual(cursor);
    expect(parseCategoryCursor(undefined, category, now)).toBeNull();
    expect(CATEGORY_PAGE_SIZE).toBe(30);
  });

  it.each(["", "!invalid", "a".repeat(641), [encode(cursor), encode(cursor)],
    encode({ ...cursor, v: 2 }), encode({ ...cursor, direction: "offset" }),
    encode({ ...cursor, category: "33333333-3333-4333-8333-333333333333" }),
    encode({ ...cursor, boundary: { ...cursor.boundary, at: "2026-02-30T08:00:00.000000Z" } }),
    encode({ ...cursor, anchor: "2026-09-27T08:00:00.123Z" }),
    encode({ ...cursor, anchor: "2027-09-27T08:00:00.000000Z" }),
    encode({ ...cursor, boundary: { ...cursor.boundary, at: "2026-09-28T08:00:00.000000Z" } }),
    encode({ ...cursor, boundary: { ...cursor.boundary, id: "x' or true --" } }),
  ])("rejects malformed, duplicate, foreign-category and future cursors (%#)", raw => {
    expect(() => parseCategoryCursor(raw, category, now)).toThrow("Invalid archive cursor");
  });

  it("uses a strict compound boundary and reverses both sort columns for backward navigation", () => {
    const dialect = new PgDialect();
    for (const direction of ["older", "newer"] as const) {
      const boundary = dialect.sqlToQuery(archiveBoundary(cursor.boundary, direction));
      expect(boundary.sql).toContain(direction === "older" ? " < " : " > ");
      expect(boundary.sql).toContain('("articles"."published_at", "articles"."id")');
      expect(boundary.params).toEqual([cursor.boundary.at, cursor.boundary.id]);
      expect(archiveOrder(direction).map(column => dialect.sqlToQuery(column).sql))
        .toEqual([`"articles"."published_at" ${direction === "older" ? "desc" : "asc"}`, `"articles"."id" ${direction === "older" ? "desc" : "asc"}`]);
    }
  });

  it("enforces public status, publication cutoff and creation cutoff even for forged navigation state", () => {
    const query = new PgDialect().sqlToQuery(archiveFilter(category, cursor.anchor));
    expect(query.sql).toContain('"articles"."is_public" =');
    expect(query.sql).toContain('"articles"."published_at" <= least(');
    expect(query.sql).toContain('"articles"."created_at" <=');
    expect(query.params).toEqual([category, true, cursor.anchor, cursor.anchor]);
  });
});
