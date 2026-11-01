import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@newspoint/db/schema";
import { NextRequest } from "next/server";
import { legacyArticleDestination } from "./legacy-article-query";
import { proxy } from "../proxy";

const holder = vi.hoisted(() => ({ db: null as ReturnType<typeof drizzle<typeof schema>> | null, fail: false, calls: 0 }));
vi.mock("@newspoint/db", async () => ({
  ...await vi.importActual<typeof import("@newspoint/db/schema")>("@newspoint/db/schema"),
  getDb: () => { holder.calls++; if (holder.fail) throw new Error("private database connection details"); return holder.db; },
}));
import { GET } from "../app/api/legacy-article/route";

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create table articles (source_system text, legacy_id bigint, path text, is_public boolean, published_at timestamptz);
    insert into articles values
      ('wordpress', 1, '/fixture-public/', true, now() - interval '1 day'),
      ('wordpress', 2, '/fixture-draft/', false, now() - interval '1 day'),
      ('studio', 3, '/fixture-studio/', true, now() - interval '1 day'),
      ('wordpress', 4, '/fixture-future/', true, now() + interval '1 day'),
      ('wordpress', 5, '/fixture-undated/', true, null),
      ('wordpress', 6, '//external.test/', true, now() - interval '1 day');
  `);
  holder.db = drizzle(pg, { schema });
}, 30000);
beforeEach(() => { holder.fail = false; holder.calls = 0; });
afterAll(async () => { await pg?.close(); });

describe("WordPress article shortlinks", () => {
  it("rewrites only root p requests and preserves the existing cursor behavior", () => {
    const request = (url: string) => new NextRequest(url, { nextConfig: { trailingSlash: true } });
    const rewritten = proxy(request("https://example.test/?p=1&utm_source=old"));
    expect(rewritten.headers.get("x-middleware-rewrite")).toBe("https://example.test/api/legacy-article/?p=1&utm_source=old");
    for (const url of ["https://example.test/", "https://example.test/?utm_source=old", "https://example.test/article/?p=1"]) {
      expect(proxy(request(url)).headers.has("x-middleware-rewrite")).toBe(false);
    }
    const cursor = proxy(request("https://example.test/plovdiv/?cursor=fixture"));
    expect(cursor.status).toBe(308);
    expect(cursor.headers.get("location")).toBe("https://example.test/plovdiv/archive/fixture/");
  });

  it("uses the actual public WordPress lookup and keeps tracking on a301", async () => {
    const response = await GET(new Request("https://example.test/api/legacy-article/?p=1&utm_source=old"));
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/fixture-public/?utm_source=old");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([2, 3, 4, 5, 6, 999])("returns404 for an unavailable or unsafe legacy post %s", async id => {
    const response = await GET(new Request(`https://example.test/api/legacy-article/?p=${id}`));
    expect(response.status).toBe(404);
    expect(response.headers.has("location")).toBe(false);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("fixture-");
  });

  it.each(["", "p=", "p=0", "p=-1", "p=1.5", "p=1&p=2", "p=1%20or%201%3D1", "p=9007199254740992"])("rejects malformed IDs without a database call: %s", async query => {
    const response = await GET(new Request(`https://example.test/api/legacy-article/?${query}`));
    expect(response.status).toBe(404);
    expect(holder.calls).toBe(0);
  });

  it("reports a transient database failure as503 instead of404 and does not leak errors", async () => {
    holder.fail = true;
    const response = await GET(new Request("https://example.test/api/legacy-article/?p=1"));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe("Temporarily unavailable");
  });

  it.each(["/", "//external.test/", "https://external.test/", "/\\external/", "/article/?next=foo", "/article/#anchor", "/line\nbreak/", "/a/../", "/%2e%2e/", "/a/%2e%2e/"])("rejects unsafe stored destinations %s", path => {
    expect(legacyArticleDestination(path, new URLSearchParams("p=1"))).toBeNull();
  });
  it("encodes a preserved Unicode path into a valid Location header", () => {
    const location = legacyArticleDestination("/новина/", new URLSearchParams("p=1&utm_source=archive"));
    expect(location).toBe("/%D0%BD%D0%BE%D0%B2%D0%B8%D0%BD%D0%B0/?utm_source=archive");
    expect(() => new Response(null, { status: 301, headers: { Location: location! } })).not.toThrow();
  });
});
