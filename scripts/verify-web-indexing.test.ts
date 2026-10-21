import { describe, expect, it } from "vitest";
import { verifyWebIndexing } from "../deploy/np2/verify-web-indexing.mjs";
const env = { WEB_URL: "https://newspoint.bg", NP_PUBLIC_INDEXING: "1" };
const manifest = (value: string) => ({ headers: ["/:path*", "/admin/:path*", "/api/:path*", "/draft/:path*"].map((source, index) => ({ source, headers: [{ key: "X-Robots-Tag", value: index === 0 ? value : "noindex, nofollow" }] })) });
describe("release indexing invariant", () => {
  it("catches the production noindex regression before replacement", () => {
    expect(() => verifyWebIndexing(env, manifest("noindex, nofollow"))).toThrow("mismatch");
    expect(verifyWebIndexing(env, manifest("index, follow"))).toEqual({ pass: true, expected: "index, follow" });
  });
  it("keeps preview fail-closed and rejects missing protected exclusions", () => {
    expect(verifyWebIndexing({ ...env, WEB_URL: "https://site44159-izdo3c.scloudsite101.com" }, manifest("noindex, nofollow"))).toMatchObject({ pass: true });
    expect(() => verifyWebIndexing(env, { headers: manifest("index, follow").headers.slice(0, 1) })).toThrow("private");
  });
});
