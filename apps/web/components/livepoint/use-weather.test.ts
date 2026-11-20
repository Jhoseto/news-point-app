import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataEnvelope, WeatherForecast } from "../../lib/livepoint/types";
import { createWeatherStore } from "./use-weather";

function forecast(cityId = "plovdiv", place = "Пловдив", temperatureC = 12): DataEnvelope<WeatherForecast> {
  return {
    source: "livepoint/weather",
    status: "ok",
    fetchedAt: "2026-11-20T10:00:00Z",
    expiresAt: "2026-11-20T13:00:00Z",
    payload: {
      cityId, place, updatedAt: "2026-11-20T09:00:00Z",
      current: {
        time: "2026-11-20T10:00:00Z", temperatureC, symbolCode: "clearsky_day",
        humidityPct: null, windSpeedMs: null, windFromDegrees: null,
        cloudAreaPct: null, pressureHpa: null, precipitationMm: null,
      },
      hours: [], days: [],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function response(data: DataEnvelope<WeatherForecast>) {
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("tab-local weather selection", () => {
  it("never puts the old city's values beneath a newly selected city", async () => {
    const next = deferred<Response>();
    const fetcher = vi.fn(() => next.promise);
    vi.stubGlobal("fetch", fetcher);
    const store = createWeatherStore();
    store.initialize(forecast());
    store.selectCity("sofia");
    expect(store.getSnapshot()).toMatchObject({ cityId: "sofia", loading: true, data: { payload: null } });
    const pending = store.refresh("sofia");
    next.resolve(response(forecast("sofia", "София", 5)));
    await pending;
    expect(store.getSnapshot()).toMatchObject({ cityId: "sofia", loading: false, data: { payload: { cityId: "sofia", current: { temperatureC: 5 } } } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent requests made by the page and the panel", async () => {
    const next = deferred<Response>();
    const fetcher = vi.fn(() => next.promise);
    vi.stubGlobal("fetch", fetcher);
    const store = createWeatherStore();
    store.initialize(forecast());
    const first = store.refresh("plovdiv");
    const second = store.refresh("plovdiv", true);
    expect(first).toBe(second);
    next.resolve(response(forecast()));
    await first;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the newest selection when an earlier request finishes last", async () => {
    const sofia = deferred<Response>();
    const varna = deferred<Response>();
    const fetcher = vi.fn((url: string) => url.includes("sofia") ? sofia.promise : varna.promise);
    vi.stubGlobal("fetch", fetcher);
    const store = createWeatherStore();
    store.initialize(forecast());
    store.selectCity("sofia");
    const first = store.refresh("sofia");
    store.selectCity("varna");
    const second = store.refresh("varna");
    varna.resolve(response(forecast("varna", "Варна", 14)));
    await second;
    sofia.resolve(response(forecast("sofia", "София", 5)));
    await first;
    expect(store.getSnapshot()).toMatchObject({ cityId: "varna", loading: false, data: { payload: { cityId: "varna" } } });
    store.selectCity("sofia");
    expect(store.getSnapshot()).toMatchObject({ cityId: "sofia", loading: false, data: { payload: { cityId: "sofia" } } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not use Plovdiv as a fallback for a failed Sofia request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const store = createWeatherStore();
    store.initialize(forecast());
    store.selectCity("sofia");
    await store.refresh("sofia");
    expect(store.getSnapshot()).toMatchObject({ cityId: "sofia", loading: false, data: { status: "unavailable", payload: null } });
    expect(store.getSnapshot()?.error).toBeTruthy();
  });

  it("retains only the selected city's last forecast when its refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const store = createWeatherStore();
    store.initialize(forecast("sofia", "София", 5), "sofia");
    await store.refresh("sofia", true);
    expect(store.getSnapshot()).toMatchObject({ cityId: "sofia", loading: false, data: { status: "stale", payload: { cityId: "sofia" } } });
    expect(store.getSnapshot()?.error).toBeTruthy();
  });

  it("rejects an otherwise valid response for a different city", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(forecast())));
    const store = createWeatherStore();
    store.initialize(forecast());
    store.selectCity("sofia");
    await store.refresh("sofia");
    expect(store.getSnapshot()).toMatchObject({ cityId: "sofia", data: { payload: null }, loading: false });
    expect(store.getSnapshot()?.error).toBeTruthy();
  });

  it("requires the display name to match the selected city too", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(forecast("sofia", "Пловдив"))));
    const store = createWeatherStore();
    store.initialize(forecast());
    store.selectCity("sofia");
    await store.refresh("sofia");
    expect(store.getSnapshot()?.data.payload).toBeNull();
  });

  it("ignores unknown city values before making a request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const store = createWeatherStore();
    store.initialize(forecast());
    store.selectCity("https://example.com/");
    await store.refresh("constructor");
    expect(store.getSnapshot()?.cityId).toBe("plovdiv");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds a stalled request to twelve seconds and allows retry", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetcher);
    const store = createWeatherStore();
    store.initialize(forecast());
    const request = store.refresh("plovdiv");
    await vi.advanceTimersByTimeAsync(12_000);
    await request;
    expect(store.getSnapshot()).toMatchObject({ loading: false, data: { status: "stale" } });
    fetcher.mockImplementationOnce(async () => response(forecast()));
    await store.refresh("plovdiv", true);
    expect(store.getSnapshot()).toMatchObject({ loading: false, error: null, data: { status: "ok" } });
  });

  it("does not let a default header snapshot reset the reader's selection", () => {
    const store = createWeatherStore();
    store.initialize(forecast("sofia", "София"), "sofia");
    store.initialize(forecast());
    expect(store.getSnapshot()?.cityId).toBe("sofia");
    store.initialize(forecast("varna", "Варна"), "varna");
    expect(store.getSnapshot()?.cityId).toBe("varna");
  });

  it("discards mismatched server seed data for an explicit city URL", () => {
    const store = createWeatherStore();
    store.initialize(forecast(), "sofia");
    expect(store.getSnapshot()).toMatchObject({ cityId: "sofia", data: { payload: null } });
  });

  it("accepts a newer server snapshot for the same city without resetting another city", () => {
    const store = createWeatherStore();
    store.initialize(forecast());
    const newer = forecast();
    newer.payload!.current.time = "2026-11-20T11:00:00Z";
    store.initialize(newer);
    expect(store.getSnapshot()?.data.payload?.current.time).toBe("2026-11-20T11:00:00Z");
    store.initialize(forecast("sofia", "София"), "sofia");
    store.initialize(newer);
    expect(store.getSnapshot()?.cityId).toBe("sofia");
  });
});
