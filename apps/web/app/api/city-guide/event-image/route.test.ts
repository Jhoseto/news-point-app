import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/city-guide/local-observations", () => ({ loadCityObservations: mocks.load }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
import { GET as apiGet } from "./route";
import { GET as publicGet } from "../../../moyat-plovdiv/event-image/route";
const bytes = Buffer.from("RIFF0000WEBPexplicit-test-fixture");
const hash = createHash("sha256").update(bytes).digest("hex");
const group = { sourceId: "plovdiv-theatre", status: "observed", items: [{ key: "fixture", fields: { imageHash: hash } }] };
describe.each([
  ["API", apiGet, "/api/city-guide/event-image/"],
  ["crawlable image", publicGet, "/moyat-plovdiv/event-image/"],
] as const)("%s publication guards", (_name, GET, path) => {
const request = (digest = hash) => new Request(`http://localhost${path}?category=culture&sourceId=plovdiv-theatre&hash=${digest}`);
beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); mocks.load.mockReset().mockResolvedValue([group]); mocks.read.mockReset().mockResolvedValue(bytes); });
afterEach(() => vi.unstubAllEnvs());
it("serves only current associated immutable images", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("image/webp"); expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
});
it("refuses path traversal, wrong hashes, stale records and production", async () => {
  expect((await GET(request("../secret"))).status).toBe(404);
  expect((await GET(request("a".repeat(64)))).status).toBe(404);
  mocks.load.mockResolvedValue([{ ...group, status: "stale" }]); expect((await GET(request())).status).toBe(404);
  vi.stubEnv("NODE_ENV", "production"); expect((await GET(request())).status).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("rejects corrupted archive bytes", async () => { mocks.read.mockResolvedValue(Buffer.from("bad image")); expect((await GET(request())).status).toBe(404); });
it("serves a shelter photograph only for its own current profile", async () => {
  mocks.load.mockResolvedValue([{ ...group, sourceId: "plovdiv-dog-shelter" }]);
  const url = request().url.replace("category=culture", "category=adopt").replace("sourceId=plovdiv-theatre", "sourceId=plovdiv-dog-shelter");
  expect((await GET(new Request(url))).status).toBe(200);
  expect(mocks.load).toHaveBeenCalledWith("adopt", "plovdiv-dog-shelter");
  mocks.load.mockResolvedValue([{ ...group, sourceId: "plovdiv-dog-shelter", items: [{ key: "another", fields: { imageHash: "b".repeat(64) } }] }]);
  expect((await GET(new Request(url))).status).toBe(404);
});
it("enabled production requires explicit storage and still refuses unassociated images", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CITY_GUIDE_ENABLED", "1"); vi.stubEnv("CITY_GUIDE_STORAGE_DIR", "");
  expect((await GET(request())).status).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled();
  vi.stubEnv("CITY_GUIDE_STORAGE_DIR", "production-fixture-storage");
  expect((await GET(request())).status).toBe(200);
  mocks.load.mockResolvedValue([]);
  expect((await GET(request())).status).toBe(404);
});
});
