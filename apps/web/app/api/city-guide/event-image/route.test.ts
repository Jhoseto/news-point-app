import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/city-guide/local-observations", () => ({ loadCityObservations: mocks.load }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
import { GET } from "./route";
const bytes = Buffer.from("RIFF0000WEBPexplicit-test-fixture");
const hash = createHash("sha256").update(bytes).digest("hex");
const group = { sourceId: "plovdiv-theatre", status: "observed", items: [{ key: "fixture", fields: { imageHash: hash } }] };
const request = (digest = hash) => new Request(`http://localhost/api/city-guide/event-image?category=culture&sourceId=plovdiv-theatre&recordKey=fixture&hash=${digest}`);
beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); mocks.load.mockReset().mockResolvedValue([group]); mocks.read.mockReset().mockResolvedValue(bytes); });
afterEach(() => vi.unstubAllEnvs());
it("serves only current associated images privately", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("image/webp"); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("refuses path traversal, wrong hashes, stale records and production", async () => {
  expect((await GET(request("../secret"))).status).toBe(404);
  expect((await GET(request("a".repeat(64)))).status).toBe(404);
  mocks.load.mockResolvedValue([{ ...group, status: "stale" }]); expect((await GET(request())).status).toBe(404);
  vi.stubEnv("NODE_ENV", "production"); expect((await GET(request())).status).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("rejects corrupted archive bytes", async () => { mocks.read.mockResolvedValue(Buffer.from("bad image")); expect((await GET(request())).status).toBe(404); });
