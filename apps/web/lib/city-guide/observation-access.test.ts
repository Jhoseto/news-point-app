import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), read: vi.fn() }));
vi.mock("@newspoint/db/city", () => ({ readCitySnapshots: mocks.db }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
beforeEach(() => {
  vi.resetModules(); mocks.db.mockReset(); mocks.read.mockReset();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CITY_GUIDE_ENABLED", "1");
  vi.stubEnv("CITY_GUIDE_USE_DB_PREVIEW", "1");
});
afterEach(() => vi.unstubAllEnvs());
it("production requests only accepted visible database records even when a preview setting is present", async () => {
  mocks.db.mockResolvedValue([{ sourceId: "plovdiv-parking-rules", checkedAt: new Date().toISOString(), outcome: "parsed", items: [{ key: "fixture", fields: { label: "Explicit test fixture" } }] }]);
  const { loadCityObservations } = await import("./local-observations");
  expect((await loadCityObservations("parking"))[0]?.items).toHaveLength(1);
  expect(mocks.db).toHaveBeenCalledWith({ includeHidden: false });
  expect(mocks.read).not.toHaveBeenCalled();
});
it("a database failure cannot fall back to hidden local files", async () => {
  mocks.db.mockRejectedValue(new Error("fixture offline"));
  const { loadCityObservations } = await import("./local-observations");
  expect(await loadCityObservations("parking")).toEqual([]);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("disabled production does not read database or files", async () => {
  vi.stubEnv("CITY_GUIDE_ENABLED", "");
  const { loadCityObservations } = await import("./local-observations");
  expect(await loadCityObservations("parking")).toEqual([]);
  expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it("defers the municipal category and permit records even when their snapshots exist", async () => {
  mocks.db.mockResolvedValue([{ sourceId: "plovdiv-low-emission-permit", checkedAt: new Date().toISOString(), outcome: "parsed", items: [] }]);
  const { loadCityObservations } = await import("./local-observations");
  expect(await loadCityObservations("municipality")).toEqual([]);
  expect(mocks.db).not.toHaveBeenCalled();
  expect(await loadCityObservations("transport")).toEqual([]);
});
it("reads only the requested allowed source for a media request and rejects a different category", async () => {
  mocks.db.mockResolvedValue([]);
  const { loadCityObservations } = await import("./local-observations");
  expect(await loadCityObservations("adopt", "plovdiv-dog-shelter")).toEqual([]);
  expect(mocks.db).toHaveBeenCalledWith({ includeHidden: false, sourceId: "plovdiv-dog-shelter" });
  mocks.db.mockClear();
  expect(await loadCityObservations("adopt", "plovdiv-opera")).toEqual([]);
  expect(await loadCityObservations("adopt", "")).toEqual([]);
  expect(mocks.db).not.toHaveBeenCalled();
});
