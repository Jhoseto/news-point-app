import { describe, expect, it, vi } from "vitest";
import { MobileRubricCache } from "./mobile-rubric-cache";
import type { MobileRubricFeed } from "./mobile-rubric-feed";
const fixture = (path: string, version = "menu"): MobileRubricFeed => ({ schemaVersion: 1, canonicalPath: path, menuVersion: version, contentVersion: "empty", asOfMs: Date.now(), freshUntil: Date.now() + 60_000,
  feed: { kind: "home", hero: null, support: [], main: [], aside: [], focusCarousel: [], topicsCarousel: [], voiceCarousel: [], poll: null } });
const response = (path: string) => new Response(JSON.stringify(fixture(path)), { headers: { "Content-Type": "application/json" } });
describe("bounded public rubric snapshots", () => {
  it("does not rebind browser fetch to the cache instance", async () => {
    const transport: typeof fetch = function (this: unknown) {
      if (this !== undefined) throw new Error("Illegal invocation");
      return Promise.resolve(response("/"));
    };
    const cache = new MobileRubricCache(transport); cache.configure(["/"], "menu");
    expect((await cache.load("/")).canonicalPath).toBe("/"); cache.clear();
  });
  it("deduplicates concurrent requests and expires snapshots", async () => {
    const transport = vi.fn(async () => response("/")); const cache = new MobileRubricCache(transport);
    cache.configure(["/"], "menu"); const a = cache.load("/"), b = cache.load("/"); expect(a).toBe(b); await a;
    expect(transport).toHaveBeenCalledTimes(1); expect(cache.inFlight).toBe(0); expect(cache.get("/")).toBeDefined();
    expect(cache.get("/", Date.now() + 70_000)).toBeUndefined(); cache.clear();
  });
  it("keeps at most three models and aborts obsolete requests", async () => {
    let aborted = false;
    const transport = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("abort")); })));
    const cache = new MobileRubricCache(transport); cache.configure(["/", "/a/", "/b/", "/c/"], "menu");
    for (const path of ["/", "/a/", "/b/", "/c/"]) cache.seed(fixture(path)); expect(cache.size).toBe(3);
    cache.invalidate(); const pending = cache.load("/a/").catch(() => {}); cache.configure(["/", "/b/"], "menu"); await pending;
    expect(aborted).toBe(true); expect(cache.inFlight).toBe(0); cache.clear();
  });
  it("rejects malformed, oversized, wrong-path and wrong-menu responses", async () => {
    const cases = [new Response("{}", { headers: { "Content-Type": "application/json" } }),
      response("/foreign/"), new Response(JSON.stringify(fixture("/", "old")), { headers: { "Content-Type": "application/json" } }),
      new Response(JSON.stringify({ ...fixture("/"), asOfMs: Date.now() - 70_000, freshUntil: Date.now() - 10_000 }), { headers: { "Content-Type": "application/json" } }),
      new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": "900000" } }),
      new Response('<html>offline</html>', { headers: { "Content-Type": "text/html" } })];
    for (const value of cases) { const cache = new MobileRubricCache(async () => value); cache.configure(["/"], "menu"); await expect(cache.load("/")).rejects.toThrow(); expect(cache.size).toBe(0); cache.clear(); }
  });
  it("never launches a third request or requests outside the allowlist", async () => {
    const transport = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("abort")))));
    const cache = new MobileRubricCache(transport); cache.configure(["/", "/a/", "/b/"], "menu");
    const a = cache.load("/").catch(() => {}), b = cache.load("/a/").catch(() => {});
    await expect(cache.load("/b/")).rejects.toThrow("Request limit"); await expect(cache.load("/private/")).rejects.toThrow(); expect(transport).toHaveBeenCalledTimes(2);
    cache.clear(); await Promise.all([a, b]);
  });
});
