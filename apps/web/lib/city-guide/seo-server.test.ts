import { afterEach, expect, it, vi } from "vitest";
vi.mock("./local-observations", () => ({ loadCityObservations: vi.fn(async (slug: string) => slug === "parking" ? [{ sourceId: "mall-plovdiv-parking", checkedAt: "2026-10-30T10:00:00Z", status: "observed", completeness: "complete", items: [{ key: "fixture", fields: { title: "Fixture parking" } }] }] : []) }));
import { cityDiscoveryPages, citySearchPublished } from "./seo-server";
afterEach(() => vi.unstubAllEnvs());
it("never advertises disabled, preview, or empty city categories", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WEB_URL", "https://newspoint.bg"); vi.stubEnv("NP_PUBLIC_INDEXING", "1"); vi.stubEnv("CITY_GUIDE_ENABLED", "0");
  expect(citySearchPublished()).toBe(false);
  expect(await cityDiscoveryPages()).toEqual([]);
  vi.stubEnv("CITY_GUIDE_ENABLED", "1");
  expect((await cityDiscoveryPages()).map(page => page.path)).toEqual(["/moyat-plovdiv/", "/moyat-plovdiv/parking/"]);
  vi.stubEnv("NP_PUBLIC_INDEXING", "0");
  expect(await cityDiscoveryPages()).toEqual([]);
});
