import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
const database = vi.hoisted(() => ({ write: vi.fn(), close: vi.fn() }));
vi.mock("@newspoint/db/city", () => ({ createCityPilotWriter: () => database }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
it("retries a fetched source after a DB failure instead of advancing its schedule, and closes the connection", async () => {
  const tempRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(tempRoot, "np-city-retry-"));
  const argv = process.argv;
  try {
    vi.stubEnv("CITY_GUIDE_STORAGE_DIR", directory);
    vi.stubEnv("CITY_PILOT_PERSIST_DB", "1"); vi.stubEnv("CITY_PILOT_STORE_PREVIEW", "1");
    process.argv = ["node", "explicit-test-fixture", "--sources=plovdiv-community-air"];
    const previous = { version: 1, sources: { "plovdiv-community-air": { failures: 0, items: {}, nextDueAt: "2020-01-01T00:00:00Z" } } };
    await writeFile(join(directory, "state.json"), JSON.stringify(previous));
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response("[]", { headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", fetch);
    database.write.mockReset().mockRejectedValueOnce(new Error("Explicit test: DB connection lost")).mockResolvedValue({});
    database.close.mockReset().mockResolvedValue(undefined);
    const { run } = await import("./run");
    await expect(run()).rejects.toThrow("DB connection lost");
    expect(JSON.parse(await readFile(join(directory, "state.json"), "utf8"))).toEqual(previous);
    expect(database.close).toHaveBeenCalledTimes(1);
    await run();
    expect(fetch).toHaveBeenCalledTimes(2);
    const saved = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
    expect(Date.parse(saved.sources["plovdiv-community-air"].nextDueAt)).toBeGreaterThan(Date.now());
    expect(database.close).toHaveBeenCalledTimes(2);
  } finally {
    process.argv = argv;
    if (!directory.startsWith(tempRoot + sep + "np-city-retry-")) throw new Error("Unexpected test directory");
    await rm(directory, { recursive: true, force: true });
  }
});
