import "server-only";
import { metUserAgent } from "../config";
import type { DataEnvelope, WeatherForecast } from "../types";
import { DEFAULT_WEATHER_CITY, getWeatherCity, type WeatherCity } from "./cities";
import { parseMetCompact } from "./parse";

const ENDPOINT = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
// Locationforecast requires >=3 hours between identical successful requests
// outside the Nordic region, and respecting a later provider Expires header.
const REFRESH_MS = 3 * 60 * 60_000;
const RETRY_MS = 5 * 60_000;
// All 31 cold cities can add up to 3 seconds of queueing. Leave room for the
// application response inside the client's deadline even during that burst.
const TIMEOUT_MS = 8_000;
const REQUEST_SPACING_MS = 100;

type CacheEntry = {
  body: unknown;
  etag: string | null;
  lastModified: string | null;
  expiresAt: number;
  fetchedAt: number;
};
type CitySlot = {
  cached?: CacheEntry;
  retryAt?: number;
  pending?: Promise<DataEnvelope<WeatherForecast>>;
};
type WeatherCache = { cities: Map<string, CitySlot>; nextRequestAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __npMetCityCache: WeatherCache | undefined;
}

function cache(): WeatherCache {
  return globalThis.__npMetCityCache ??= { cities: new Map(), nextRequestAt: 0 };
}

function expiresAt(header: string | null, now: number): number {
  const parsed = header ? Date.parse(header) : NaN;
  return Math.max(now + REFRESH_MS, Number.isFinite(parsed) ? parsed : 0);
}

function unavailable(): DataEnvelope<WeatherForecast> {
  return {
    source: "livepoint/weather", fetchedAt: null, expiresAt: null,
    status: "unavailable", message: "Няма актуална прогноза за избрания град.", payload: null,
  };
}

function fromCache(slot: CitySlot, city: WeatherCity, stale = false): DataEnvelope<WeatherForecast> {
  const entry = slot.cached;
  if (!entry) return unavailable();
  try {
    const forecast = parseMetCompact(entry.body, new Date(), city);
    return {
      source: "livepoint/weather",
      fetchedAt: new Date(entry.fetchedAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
      status: stale ? "stale" : "ok",
      ...(stale ? { message: "Последната валидна прогноза за този град (източникът временно не отговаря)." } : {}),
      payload: forecast,
    };
  } catch {
    // The remaining series may no longer cover the current hour.
    return unavailable();
  }
}

async function refresh(slot: CitySlot, city: WeatherCity): Promise<DataEnvelope<WeatherForecast>> {
  const shared = cache();
  // Even cold requests for all supported cities stay below 20 upstream requests/s.
  const startAt = Math.max(Date.now(), shared.nextRequestAt);
  shared.nextRequestAt = startAt + REQUEST_SPACING_MS;
  if (startAt > Date.now()) await new Promise((resolve) => setTimeout(resolve, startAt - Date.now()));

  const params = new URLSearchParams({ lat: String(city.lat), lon: String(city.lon) });
  if (city.altitude !== undefined) params.set("altitude", String(city.altitude));
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": metUserAgent() };
  if (slot.cached?.lastModified) headers["If-Modified-Since"] = slot.cached.lastModified;
  if (slot.cached?.etag) headers["If-None-Match"] = slot.cached.etag;

  try {
    const response = await fetch(`${ENDPOINT}?${params}`, {
      headers,
      // This city-keyed store owns caching. A second fetch cache must not replay
      // an old 304 or restart provider expiry from an old cached response.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const now = Date.now();
    if (response.status === 304 && slot.cached) {
      slot.cached = { ...slot.cached, expiresAt: expiresAt(response.headers.get("expires"), now) };
      delete slot.retryAt;
      return fromCache(slot, city);
    }
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const retryDelay = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : 0;
      const retryDate = retryAfter ? Date.parse(retryAfter) : NaN;
      slot.retryAt = Math.max(now + RETRY_MS, now + retryDelay, Number.isFinite(retryDate) ? retryDate : 0);
      return fromCache(slot, city, true);
    }
    const body: unknown = await response.json();
    parseMetCompact(body, new Date(now), city);
    slot.cached = {
      body,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      expiresAt: expiresAt(response.headers.get("expires"), now),
      fetchedAt: now,
    };
    delete slot.retryAt;
    return fromCache(slot, city);
  } catch {
    slot.retryAt = Date.now() + RETRY_MS;
    return fromCache(slot, city, true);
  }
}

export async function getWeatherForecast(cityId = DEFAULT_WEATHER_CITY.id): Promise<DataEnvelope<WeatherForecast>> {
  const city = getWeatherCity(cityId);
  if (!city) throw new Error("Unsupported weather city");
  const shared = cache();
  let slot = shared.cities.get(city.id);
  if (!slot) {
    slot = {};
    shared.cities.set(city.id, slot);
  }
  if (slot.cached && slot.cached.expiresAt > Date.now()) return fromCache(slot, city);
  if (slot.retryAt && slot.retryAt > Date.now()) return fromCache(slot, city, true);
  if (slot.pending) return slot.pending;
  const currentSlot = slot;
  currentSlot.pending = refresh(currentSlot, city).finally(() => { delete currentSlot.pending; });
  return currentSlot.pending;
}
