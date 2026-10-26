import { afterEach, expect, it, vi } from "vitest";
import { cityGuideEnabled } from "./access";
import { cityStorageDirectories } from "./storage";

afterEach(() => vi.unstubAllEnvs());
it("requires an explicit production switch and never uses preview storage in production", () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CITY_GUIDE_ENABLED", "");
  vi.stubEnv("CITY_GUIDE_STORAGE_DIR", ""); vi.stubEnv("CITY_PILOT_OUTPUT_DIR", "preview-fixture");
  expect(cityGuideEnabled()).toBe(false);
  expect(cityStorageDirectories("documents")).toEqual([]);
  vi.stubEnv("CITY_GUIDE_ENABLED", "1");
  expect(cityGuideEnabled()).toBe(true);
  expect(cityStorageDirectories("event-images")).toEqual([]);
  vi.stubEnv("CITY_GUIDE_STORAGE_DIR", "city-storage-fixture");
  expect(cityStorageDirectories("documents")[0]).toMatch(/city-storage-fixture[/\\]documents$/u);
});
