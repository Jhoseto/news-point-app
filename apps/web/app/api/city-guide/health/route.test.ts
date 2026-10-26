import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { CITY_SOURCE_POLICY } from "@newspoint/content/city-sources";
import { cityCollectionHealth } from "@newspoint/content/city-health";
const read = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", () => ({ readFile: read }));
import { GET } from "./route";
const secret = "explicit-health-test-fixture-secret";
const request = (token = secret) => new Request("http://localhost/api/city-guide/health", { headers: { "x-revalidate-secret": token } });
const report = () => cityCollectionHealth(Object.fromEntries(Object.keys(CITY_SOURCE_POLICY).map(id => [id, { lastSuccessAt: new Date().toISOString(), nextDueAt: new Date(Date.now() + 60 * 60_000).toISOString(), failures: 0 }])));
beforeEach(() => { vi.stubEnv("REVALIDATE_SECRET", secret); vi.stubEnv("CITY_GUIDE_STORAGE_DIR", resolve("explicit-private-health-fixture")); read.mockReset().mockResolvedValue(JSON.stringify(report())); });
afterEach(() => vi.unstubAllEnvs());
it("protects operational information and never caches it publicly", async () => {
  expect((await GET(request("wrong"))).status).toBe(401); expect(read).not.toHaveBeenCalled();
  const response = await GET(request());
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("reports a stopped collector, failed source or malformed health file as unavailable", async () => {
  read.mockResolvedValue(JSON.stringify({ ...report(), checkedAt: new Date(Date.now() - 11 * 60_000).toISOString() }));
  expect((await GET(request())).status).toBe(503);
  read.mockResolvedValue(JSON.stringify({ ...report(), status: "degraded", healthySources: 0, sources: [{ id: "fixture", status: "failed" }] }));
  expect((await GET(request())).status).toBe(503);
  read.mockResolvedValue("{}"); expect((await GET(request())).status).toBe(503);
  vi.stubEnv("CITY_GUIDE_STORAGE_DIR", ""); expect((await GET(request())).status).toBe(503);
});
