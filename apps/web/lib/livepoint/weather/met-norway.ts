import "server-only";
import { metUserAgent, PLOVDIV } from "../config";
import type { DataEnvelope, WeatherForecast } from "../types";
import { parseMetCompact } from "./parse";

const ENDPOINT = "https://api.met.no/weatherapi/locationforecast/2.0/compact";

type CacheEntry = {
  body: unknown;
  etag: string | null;
  lastModified: string | null;
  expiresAt: number;
  fetchedAt: number;
  forecast: WeatherForecast;
};

declare global {
  // eslint-disable-next-line no-var
  var __npMetCache: CacheEntry | undefined;
}

function cacheSlot(): { current: CacheEntry | undefined } {
  return {
    get current() {
      return globalThis.__npMetCache;
    },
    set current(value) {
      globalThis.__npMetCache = value;
    },
  };
}

function parseExpires(header: string | null, fallbackMs: number): number {
  if (!header) return Date.now() + fallbackMs;
  const ms = Date.parse(header);
  return Number.isFinite(ms) ? ms : Date.now() + fallbackMs;
}

export async function getWeatherForecast(): Promise<DataEnvelope<WeatherForecast>> {
  const slot = cacheSlot();
  const cached = slot.current;
  if (cached && cached.expiresAt > Date.now() + 5_000) {
    return {
      source: "livepoint/weather",
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      expiresAt: new Date(cached.expiresAt).toISOString(),
      status: "ok",
      payload: cached.forecast,
    };
  }

  const url = `${ENDPOINT}?lat=${PLOVDIV.lat}&lon=${PLOVDIV.lon}&altitude=${PLOVDIV.altitude}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": metUserAgent(),
  };
  if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

  try {
    const response = await fetch(url, { headers, cache: "no-store" });
    if (response.status === 304 && cached) {
      const expiresAt = parseExpires(response.headers.get("expires"), 30 * 60_000);
      slot.current = { ...cached, expiresAt };
      return {
        source: "livepoint/weather",
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        status: "ok",
        payload: cached.forecast,
      };
    }

    if (!response.ok) {
      if (cached) {
        return {
          source: "livepoint/weather",
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
          expiresAt: new Date(cached.expiresAt).toISOString(),
          status: "stale",
          message: "Последната валидна прогноза (източникът временно не отговаря).",
          payload: cached.forecast,
        };
      }
      return {
        source: "livepoint/weather",
        fetchedAt: null,
        expiresAt: null,
        status: "unavailable",
        message: "Няма актуална прогноза.",
        payload: null,
      };
    }

    const body: unknown = await response.json();
    const forecast = parseMetCompact(body);
    const fetchedAt = Date.now();
    const expiresAt = parseExpires(response.headers.get("expires"), 30 * 60_000);
    slot.current = {
      body,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      expiresAt,
      fetchedAt,
      forecast,
    };

    return {
      source: "livepoint/weather",
      fetchedAt: new Date(fetchedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      status: "ok",
      payload: forecast,
    };
  } catch {
    if (cached) {
      return {
        source: "livepoint/weather",
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        expiresAt: new Date(cached.expiresAt).toISOString(),
        status: "stale",
        message: "Последната валидна прогноза (мрежова грешка).",
        payload: cached.forecast,
      };
    }
    return {
      source: "livepoint/weather",
      fetchedAt: null,
      expiresAt: null,
      status: "unavailable",
      message: "Няма актуална прогноза.",
      payload: null,
    };
  }
}
