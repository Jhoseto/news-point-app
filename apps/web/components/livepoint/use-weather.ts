"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_WEATHER_CITY, getWeatherCity } from "../../lib/livepoint/weather/cities";
import type { DataEnvelope, WeatherForecast } from "../../lib/livepoint/types";

type WeatherData = DataEnvelope<WeatherForecast>;
type WeatherState = { cityId: string; data: WeatherData; loading: boolean; error: string | null };
type CachedWeather = { data: WeatherData; requestedAt: number };

const REQUEST_TIMEOUT_MS = 12_000;
const CLIENT_REFRESH_MS = 60_000;

function unavailable(): WeatherData {
  return { source: "livepoint/weather", fetchedAt: null, expiresAt: null, status: "unavailable", payload: null };
}

function matchingData(data: WeatherData, cityId: string): WeatherData {
  return data.payload && data.payload.cityId !== cityId ? unavailable() : data;
}

function initialState(initial: WeatherData, requestedCity?: string): WeatherState {
  const cityId = getWeatherCity(requestedCity ?? initial.payload?.cityId ?? "")?.id ?? DEFAULT_WEATHER_CITY.id;
  return { cityId, data: matchingData(initial, cityId), loading: false, error: null };
}

/** A tab-local store: no location lookup, cookies, or persistent browser storage. */
export function createWeatherStore() {
  let current: WeatherState | null = null;
  const listeners = new Set<() => void>();
  const cache = new Map<string, CachedWeather>();
  const pending = new Map<string, Promise<void>>();

  function publish(next: WeatherState) {
    current = next;
    listeners.forEach((listener) => listener());
  }

  function failure(cityId: string, message: string) {
    const previous = cache.get(cityId)?.data;
    const data: WeatherData = previous?.payload
      ? { ...previous, status: "stale", message }
      : { ...unavailable(), message };
    if (current?.cityId === cityId) publish({ cityId, data, loading: false, error: message });
  }

  function refresh(cityId: string, force = false): Promise<void> {
    if (!getWeatherCity(cityId) || current?.cityId !== cityId) return Promise.resolve();
    const running = pending.get(cityId);
    if (running) return running;
    const cached = cache.get(cityId);
    if (!force && cached && Date.now() - cached.requestedAt < CLIENT_REFRESH_MS) return Promise.resolve();

    publish({ ...current, loading: true, error: null });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const request = Promise.resolve().then(async () => {
      try {
        const response = await fetch(`/api/livepoint/weather/?city=${encodeURIComponent(cityId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("weather request failed");
        const data = await response.json() as WeatherData;
        if (!data || typeof data !== "object" || !["ok", "stale", "unavailable"].includes(data.status)) {
          throw new Error("invalid weather response");
        }
        if (!data.payload) {
          failure(cityId, data.message || "Няма актуална прогноза за този град. Опитайте отново.");
          return;
        }
        const city = getWeatherCity(cityId);
        if (data.payload.cityId !== cityId || data.payload.place !== city?.name) {
          throw new Error("weather city mismatch");
        }
        cache.set(cityId, { data, requestedAt: Date.now() });
        // A slower request for a previous selection may warm its own cache only.
        if (current?.cityId === cityId) publish({ cityId, data, loading: false, error: null });
      } catch {
        failure(cityId, "Прогнозата не се зареди. Опитайте отново.");
      } finally {
        clearTimeout(timeout);
        pending.delete(cityId);
      }
    });
    pending.set(cityId, request);
    return request;
  }

  function initialize(initial: WeatherData, explicitCity?: string) {
    const seed = initialState(initial, explicitCity);
    const previous = cache.get(seed.cityId)?.data.payload;
    const newerSeed = Boolean(seed.data.payload && (!previous
      || Date.parse(seed.data.payload.current.time) > Date.parse(previous.current.time)
      || Date.parse(seed.data.payload.updatedAt) > Date.parse(previous.updatedAt)));
    if (newerSeed) {
      // A server snapshot is useful immediately; the first open panel refreshes it.
      cache.set(seed.cityId, { data: seed.data, requestedAt: 0 });
    }
    if (!current || (getWeatherCity(explicitCity ?? "") && current.cityId !== seed.cityId)) {
      publish({ ...seed, data: cache.get(seed.cityId)?.data ?? seed.data, loading: pending.has(seed.cityId) });
    } else if (current.cityId === seed.cityId && newerSeed && !pending.has(seed.cityId)) {
      publish(seed);
    }
  }

  function selectCity(cityId: string) {
    if (!getWeatherCity(cityId) || current?.cityId === cityId) return;
    publish({ cityId, data: cache.get(cityId)?.data ?? unavailable(), loading: true, error: null });
    // A cached selection still needs to leave the loading state when no request is due.
    const cached = cache.get(cityId);
    if (cached && Date.now() - cached.requestedAt < CLIENT_REFRESH_MS && !pending.has(cityId)) {
      publish({ cityId, data: cached.data, loading: false, error: null });
      return;
    }
    void refresh(cityId);
  }

  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    initialize,
    selectCity,
    refresh,
  };
}

const weatherStore = createWeatherStore();

export function useWeather(initial: WeatherData, options: { initialCityId?: string; refresh?: boolean } = {}) {
  const explicitCity = getWeatherCity(options.initialCityId ?? "")?.id;
  const serverState = useMemo(() => initialState(initial, explicitCity), [initial, explicitCity]);
  const [appliedCity, setAppliedCity] = useState<string | undefined>();
  const seeded = useRef(false);
  const lastExplicitCity = useRef<string | undefined>(undefined);
  const snapshot = useSyncExternalStore(
    weatherStore.subscribe,
    () => explicitCity && appliedCity !== explicitCity ? serverState : weatherStore.getSnapshot() ?? serverState,
    () => serverState,
  );

  useEffect(() => {
    // Only an explicit page URL can replace an existing city, and only on entry
    // or a changed URL. Header snapshots cannot reset the reader's choice.
    const shouldApplyCity = !seeded.current || lastExplicitCity.current !== explicitCity;
    weatherStore.initialize(initial, shouldApplyCity ? explicitCity : undefined);
    seeded.current = true;
    lastExplicitCity.current = explicitCity;
    setAppliedCity(explicitCity);
  }, [initial, explicitCity]);

  useEffect(() => {
    if (options.refresh) void weatherStore.refresh(snapshot.cityId);
  }, [snapshot.cityId, options.refresh]);

  return {
    city: getWeatherCity(snapshot.cityId) ?? DEFAULT_WEATHER_CITY,
    data: snapshot.data,
    loading: snapshot.loading,
    error: snapshot.error,
    selectCity: weatherStore.selectCity,
    retry: () => { void weatherStore.refresh(snapshot.cityId, true); },
  };
}
