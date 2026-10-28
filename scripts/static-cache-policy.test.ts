import { describe, expect, it } from "vitest";
import { publicStaticAsset, privateBypassRequired, privateBypassExpression } from "../deploy/cloudflare/static-cache-policy.mjs";
describe("Cloudflare public static cookie exception", () => {
  it.each(["/_next/static/chunks/hash.css", "/_next/static/chunks/hash.js", "/_next/static/media/hash.woff2", "/admin/_next/static/chunks/hash.js", "/fonts/manrope-cyrillic.woff2", "/media/news/2026/10/id.webp", "/media/news/2024/08/archive.jpg"])("allows the public file %s even with a staff cookie", path => {
    expect(publicStaticAsset(path)).toBe(true);
    expect(privateBypassRequired("newspoint.bg", path, "np_studio.session_token=fixture")).toBe(false);
  });
  it.each(["/admin/", "/admin/api/editor/articles/", "/api/live/", "/api/search/", "/settings/", "/search/", "/admin/login/", "/admin/api/profile/photo/", "/admin/api/x.css", "/api/private.jpg", "/admin/_next/data/user.json", "/media/users/profiles/private.webp", "/media/podcasts/private.webp", "/brand/newspoint-logo.webp", "/sw.js", "/manifest.webmanifest", "/edge-article-cache/v1/desktop/article/", "/article/"])("preserves cookie-bearing bypass for %s", path => {
    expect(publicStaticAsset(path)).toBe(false);
    expect(privateBypassRequired("newspoint.bg", path, "fixture=1")).toBe(true);
  });
  it.each(["/_next/static/../../admin/private.js", "/media/news/../users/private.webp", "/media/news/%2e%2e/users/private.webp", "/admin/_next/static/%2fapi/private.js", "/media/news/a\\private.webp", "/_next/static/chunks/a.html", "/fonts/not-font.json"])("rejects traversal, encoded routing and wrong extensions %s", path => {
    expect(publicStaticAsset(path)).toBe(false);
  });
  it("keeps existing anonymous document behavior and leaves other hosts alone", () => {
    expect(privateBypassRequired("newspoint.bg", "/article/")).toBe(false);
    expect(privateBypassRequired("newspoint.bg", "/admin/")).toBe(true);
    expect(privateBypassRequired("unrelated.example", "/admin/", "fixture=1")).toBe(false);
    expect(privateBypassExpression).toContain('http.cookie ne ""');
    expect(privateBypassExpression).toContain('http.request.uri.path.extension in {"jpg" "jpeg" "png" "webp" "gif" "avif"}');
  });
});
