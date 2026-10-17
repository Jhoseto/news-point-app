import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { indexingHeaderRules, publicIndexingEnabled, publicRobotsMetadata } from "./indexing-policy.mjs";

const launch = { NODE_ENV: "production", WEB_URL: "https://newspoint.bg", NP_PUBLIC_INDEXING: "1" };
function headerFor(path: string, env: Record<string, string | undefined>) {
  let result: string | undefined;
  for (const rule of indexingHeaderRules(env)) if (getPathMatch(rule.source)(path)) result = rule.headers[0]!.value;
  return result;
}
describe("public indexing launch gate", () => {
  it("uses the same explicit opt-in for public headers and HTML metadata", () => {
    expect(publicIndexingEnabled(launch)).toBe(true);
    expect(publicRobotsMetadata(launch)).toEqual({ index: true, follow: true, "max-image-preview": "large" });
    for (const path of ["/", "/plovdiv/", "/article-slug/", "/sitemap.xml"]) expect(headerFor(path, launch)).toBe("index, follow");
  });
  it.each([{}, { ...launch, NP_PUBLIC_INDEXING: "0" }, { ...launch, NP_PUBLIC_INDEXING: "true" }, { ...launch, NODE_ENV: "development" }, ...["", "http://newspoint.bg", "https://127.0.0.1", "https://[::1]", "https://localhost", "https://preview.trycloudflare.com", "https://site44159-izdo3c.scloudsite101.com", "https://newspoint.bg/path", "https://user:pass@newspoint.bg", "https://newspoint.bg?x=1"].map(WEB_URL => ({ ...launch, WEB_URL }))])("fails closed for local/preview/missing or invalid configuration", (env) => {
    expect(publicIndexingEnabled(env)).toBe(false);
    expect(publicRobotsMetadata(env).index).toBe(false);
    expect(headerFor("/article/", env)).toBe("noindex, nofollow");
  });
  it.each(["/admin/", "/admin/articles/new/", "/api/search/", "/draft/private-id/", "/settings/", "/search/", "/offline/", "/plovdiv/archive/page-token/"])("keeps excluded route %s noindex even at launch", path => {
    expect(headerFor(path, launch)).toBe("noindex, nofollow");
  });
});
