import { afterEach, beforeEach, expect, it, vi } from "vitest";

const load = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/city-guide/local-observations", () => ({ loadCityObservations: load }));
import { GET } from "./route";

const request = (source = "plovdiv-tax-notices", key = "qa-deadline") => new Request(`http://localhost/api/city-guide/calendar?sourceId=${source}&recordKey=${key}`);
const fixture = { sourceId: "plovdiv-tax-notices", status: "observed", items: [{ key: "qa-deadline", fields: { dueDate: "2026-11-02", label: "Explicit calendar QA fixture" } }] };

beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); load.mockReset(); load.mockResolvedValue([fixture]); });
afterEach(() => vi.unstubAllEnvs());

it("defers municipal calendar downloads without loading their records", async () => {
  const response = await GET(request());
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(load).not.toHaveBeenCalled();
});

it("does not expose development preview records in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect((await GET(request())).status).toBe(404);
  expect(load).not.toHaveBeenCalled();
});

it("rejects unsupported sources and unknown record keys", async () => {
  expect((await GET(request("unknown"))).status).toBe(404);
  expect(load).not.toHaveBeenCalled();
  expect((await GET(request("plovdiv-tax-notices", "missing"))).status).toBe(404);
});

it("cannot download an obsolete record from a stale observation", async () => {
  load.mockResolvedValue([{ ...fixture, status: "stale" }]);
  expect((await GET(request())).status).toBe(404);
});
