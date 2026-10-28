import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => vi.unstubAllEnvs());
it("serves the exact configured ownership proof only when enabled", async () => {
  vi.stubEnv("NP_INDEXNOW_ENABLED","0");
  expect(GET().status).toBe(404);
  vi.stubEnv("NP_INDEXNOW_ENABLED","1");
  vi.stubEnv("INDEXNOW_ORIGIN","https://example.com");
  vi.stubEnv("INDEXNOW_KEY","explicit-fixture-key");
  const response=GET();
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("explicit-fixture-key");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  vi.stubEnv("INDEXNOW_KEY",""); expect(GET().status).toBe(404);
});
