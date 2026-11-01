import { describe, expect, it } from "vitest";
import { auditPublicLink, internalLinkPaths, intentionalNoindexPath } from "./link-audit";

describe("public link audit", () => {
  it("limits requests to public same-origin targets and deduplicates fragments", () => {
    expect(internalLinkPaths(["/a/#x", "/a/#y", "../b/?q=1", "https://elsewhere.test/a/", "//elsewhere.test/", "mailto:a@example.test", "/api/private/", "/admin/", "https://user:pass@example.test/"], "https://example.test", "/category/")).toEqual(["/a/", "/b/?q=1"]);
  });
  it("detects loops and never fetches an external redirect", async () => {
    let calls = 0;
    const loop = await auditPublicLink("/a/", "https://example.test", "https://example.test", async () => { calls++; return new Response(null, {status:301,headers:{location:"/a/"}}); });
    expect(loop.errors).toEqual(["Redirect loop"]);
    expect(calls).toBe(1);
    const external = await auditPublicLink("/a/", "https://example.test", "https://example.test", async () => new Response(null, {status:302,headers:{location:"https://elsewhere.test/"}}));
    expect(external.errors).toEqual(["Redirect outside audited site"]);
  });
  it("accepts intentionally noindex utility pages but flags a wrong public canonical", async () => {
    const utility = await auditPublicLink("/settings/", "https://example.test", "https://example.test", async () => new Response('<meta name="robots" content="noindex"/>', {headers:{"content-type":"text/html"}}));
    expect(utility.errors).toEqual([]);
    const conflict = await auditPublicLink("/a/", "https://example.test", "https://example.test", async () => new Response('<link rel="canonical" href="https://example.test/b/"/>', {headers:{"content-type":"text/html"}}));
    expect(conflict.errors).toEqual(["Canonical mismatch"]);
    expect(internalLinkPaths(["/cdn-cgi/l/email-protection#fixture"], "https://example.test")).toEqual([]);
  });
  it("keeps noindex and canonical evidence after a permanent redirect", async () => {
    const result = await auditPublicLink("/old/", "http://localhost:3000", "https://example.test", async input => String(input).endsWith("/old/") ? new Response(null, {status:301,headers:{location:"https://example.test/new/"}}) : new Response('<link rel="canonical" href="https://example.test/new/"/>', {headers:{"content-type":"text/html", "x-robots-tag":"noindex"}}));
    expect(result.errors).toEqual(["Public page unexpectedly noindex"]);
    expect(result.hops.map(hop=>hop.status)).toEqual([301,200]);
    expect(result.noindex).toBe(true);
    expect(result.canonical).toBe("https://example.test/new/");
  });
  it.each(["/", "/plovdiv/", "/ordinary-article/", "/moyat-plovdiv/transport/"])("rejects accidental noindex on public route %s", async path => {
    for (const directive of ["noindex, follow", "none"]) {
      const result = await auditPublicLink(path, "https://example.test", "https://example.test", async () => new Response(`<link rel="canonical" href="https://example.test${path}"/><meta name="robots" content="${directive}"/>`, {headers:{"content-type":"text/html"}}));
      expect(result.errors).toEqual(["Public page unexpectedly noindex"]);
    }
  });
  it("uses an explicit utility contract without treating whole city or similarly named routes as utilities", () => {
    for (const path of ["/search/?q=x", "/settings/", "/offline/", "/plovdiv/archive/token/", "/moyat-plovdiv/saved/"]) expect(intentionalNoindexPath(path)).toBe(true);
    for (const path of ["/settings-news/", "/plovdiv/", "/archive/", "/moyat-plovdiv/", "/moyat-plovdiv/transport/"]) expect(intentionalNoindexPath(path)).toBe(false);
  });
  it("keeps canonical checks in preview mode and requires preview noindex", async () => {
    const origin = "https://example.test";
    const make = (canonical: string, robots: string) => async () => new Response(`<link rel="canonical" href="${canonical}"/><meta name="robots" content="${robots}"/>`, {headers:{"content-type":"text/html"}});
    expect((await auditPublicLink("/a/", origin, origin, make(`${origin}/a/`, "noindex"), {expectIndexable:false})).errors).toEqual([]);
    expect((await auditPublicLink("/a/", origin, origin, make(`${origin}/b/`, "noindex"), {expectIndexable:false})).errors).toEqual(["Canonical mismatch"]);
    expect((await auditPublicLink("/a/", origin, origin, make(`${origin}/a/`, "index"), {expectIndexable:false})).errors).toEqual(["Preview page missing noindex"]);
    expect((await auditPublicLink("/settings/", origin, origin, make(`${origin}/settings/`, "index"))).errors).toEqual(["Utility page missing noindex"]);
  });
  it("does not fetch private targets, including same-origin redirects and encoded paths", async () => {
    const excluded = ["/draft/private/", "/edge-article-cache/v1/desktop/a/", "/%61pi/private/", "/admin/login/"];
    expect(internalLinkPaths(excluded, "https://example.test")).toEqual([]);
    for (const path of excluded) {
      let calls = 0;
      const result = await auditPublicLink("/public/", "https://example.test", "https://example.test", async () => { calls++; return new Response(null, {status:302,headers:{location:path}}); });
      expect(calls).toBe(1);
      expect(result.errors).toEqual(["Not a public page target"]);
      const direct = await auditPublicLink(path, "https://example.test", "https://example.test", async () => { calls++; throw new Error("Should never fetch"); });
      expect(calls).toBe(1);
      expect(direct.errors).toEqual(["Not a public page target"]);
    }
  });
});
