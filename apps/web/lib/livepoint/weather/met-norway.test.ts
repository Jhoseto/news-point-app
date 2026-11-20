import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWeatherForecast } from "./met-norway";
import { getWeatherCity, WEATHER_CITIES } from "./cities";

const sample: unknown = JSON.parse(readFileSync(new URL("../fixtures/met-compact-sample.json", import.meta.url), "utf8"));
const now = new Date("2026-09-24T12:00:00Z");
const upstream = vi.fn<typeof fetch>();
const response = (headers: HeadersInit = {}) => new Response(JSON.stringify(sample), {
  headers: { "Content-Type": "application/json", "Last-Modified": "Thu, 24 Sep 2026 11:21:37 GMT", ...headers },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  globalThis.__npMetCityCache = undefined;
  upstream.mockReset().mockImplementation(async () => response());
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); globalThis.__npMetCityCache = undefined; });

describe("city forecast boundary", () => {
  it("requests configured coordinates, identifies itself and isolates city caches", async () => {
    const plovdiv = await getWeatherForecast();
    const next = getWeatherForecast("smolyan");
    await vi.advanceTimersByTimeAsync(100);
    const smolyan = await next;
    expect(plovdiv.payload).toMatchObject({ cityId: "plovdiv", place: "Пловдив" });
    expect(smolyan.payload).toMatchObject({ cityId: "smolyan", place: "Смолян" });
    expect(upstream).toHaveBeenCalledTimes(2);
    const url = new URL(String(upstream.mock.calls[1]![0]));
    expect(url.origin).toBe("https://api.met.no");
    expect(url.searchParams.get("lat")).toBe(String(getWeatherCity("smolyan")!.lat));
    expect(url.searchParams.get("lon")).toBe(String(getWeatherCity("smolyan")!.lon));
    expect(url.searchParams.get("altitude")).toBe("921");
    expect(upstream.mock.calls[0]![1]).toMatchObject({ cache: "no-store", headers: { "User-Agent": expect.stringContaining("NewsPoint") } });
    expect(upstream.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    expect((await getWeatherForecast()).payload?.cityId).toBe("plovdiv");
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests for one city", async () => {
    let resolve!: (value: Response) => void;
    upstream.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    const a = getWeatherForecast("sofia");
    const b = getWeatherForecast("sofia");
    expect(upstream).toHaveBeenCalledTimes(1);
    resolve(response());
    const results = await Promise.all([a, b]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]!.payload?.cityId).toBe("sofia");
  });

  it("spaces cold requests across cities and keeps the cache bounded by the catalog", async () => {
    const requests = WEATHER_CITIES.map((city) => getWeatherForecast(city.id));
    expect(upstream).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(900);
    expect(upstream).toHaveBeenCalledTimes(10);
    await vi.advanceTimersByTimeAsync(2200);
    const results = await Promise.all(requests);
    expect(results.every((result) => result.status === "ok")).toBe(true);
    expect(upstream).toHaveBeenCalledTimes(31);
    expect(globalThis.__npMetCityCache?.cities.size).toBe(31);
  });

  it("respects the three-hour floor while advancing the current forecast hour", async () => {
    upstream.mockResolvedValueOnce(response({ Expires: "Thu, 24 Sep 2026 12:30:00 GMT" }));
    await getWeatherForecast();
    vi.setSystemTime(new Date("2026-09-24T14:05:00Z"));
    const cached = await getWeatherForecast();
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(cached.payload?.current.time).toBe("2026-09-24T14:00:00Z");
    expect(cached.expiresAt).toBe("2026-09-24T15:00:00.000Z");
    upstream.mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.setSystemTime(new Date("2026-09-24T15:01:00Z"));
    const refreshed = await getWeatherForecast();
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls[1]![1]?.headers).toMatchObject({ "If-Modified-Since": "Thu, 24 Sep 2026 11:21:37 GMT" });
    expect(refreshed.status).toBe("ok");
    expect(refreshed.payload?.cityId).toBe("plovdiv");
  });

  it("respects a later provider expiry", async () => {
    upstream.mockResolvedValueOnce(response({ Expires: "Thu, 24 Sep 2026 18:00:00 GMT" }));
    await getWeatherForecast();
    vi.setSystemTime(new Date("2026-09-24T17:00:00Z"));
    expect((await getWeatherForecast()).expiresAt).toBe("2026-09-24T18:00:00.000Z");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("keeps stale fallback within its own city and backs off an unavailable city", async () => {
    await getWeatherForecast("plovdiv");
    vi.setSystemTime(new Date("2026-09-24T16:00:00Z"));
    upstream.mockResolvedValue(new Response(null, { status: 503 }));
    const stale = await getWeatherForecast("plovdiv");
    expect(stale.status).toBe("stale");
    expect(stale.payload?.cityId).toBe("plovdiv");
    const other = getWeatherForecast("sofia");
    await vi.advanceTimersByTimeAsync(100);
    expect(await other).toMatchObject({ status: "unavailable", payload: null });
    await getWeatherForecast("sofia");
    await getWeatherForecast("plovdiv");
    expect(upstream).toHaveBeenCalledTimes(3);
  });

  it("does not send unknown input upstream or retain it as a cache key", async () => {
    await expect(getWeatherForecast("https://example.com")).rejects.toThrow("Unsupported weather city");
    expect(upstream).not.toHaveBeenCalled();
    expect(globalThis.__npMetCityCache).toBeUndefined();
  });

  it("does not present malformed or exhausted responses as live forecasts", async () => {
    upstream.mockResolvedValueOnce(new Response("{}"));
    expect(await getWeatherForecast()).toMatchObject({ status: "unavailable", payload: null });
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    expect(await getWeatherForecast()).toMatchObject({ status: "unavailable", payload: null });
  });
});
