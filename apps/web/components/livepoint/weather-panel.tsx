"use client";

import { useEffect, useId, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { DataEnvelope, WeatherForecast } from "@/lib/livepoint/types";
import { WEATHER_CITIES } from "@/lib/livepoint/weather/cities";
import { formatTempC, formatWindMs, skyMood, weatherLabel, windDirectionLabel } from "@/lib/livepoint/weather/labels";
import { formatFull, formatTime } from "@/lib/format";
import { WeatherChart } from "./weather-chart";
import { WeatherPageView } from "./weather-page-view";
import { MobileWeatherHours } from "./mobile-weather-hours";
import { useWeather } from "./use-weather";

const hourInSofia = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Sofia",
  hour: "numeric",
  hour12: false,
});

const dayLabel = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  weekday: "short",
  day: "numeric",
});

/** Real aerial of Plovdiv — the same photo as the brand banner. */
const PLOVDIV_VIEW = "/brand/plovdiv-aerial.webp";

export function WeatherPanel({ initial, initialCityId, variant = "panel", mobile = false }: {
  initial: DataEnvelope<WeatherForecast>;
  initialCityId?: string;
  variant?: "panel" | "page";
  mobile?: boolean;
}) {
  const selectId = useId();
  const searchParams = useSearchParams();
  const { city, data, loading, error, selectCity, retry } = useWeather(initial, {
    ...(initialCityId ? { initialCityId } : {}),
    refresh: true,
  });
  useEffect(() => {
    if (variant !== "page") return;
    const url = new URL(window.location.href);
    if (url.pathname.replace(/\/$/, "") !== "/livepoint/weather") return;
    if (url.searchParams.get("city") === city.id) return;
    url.searchParams.set("city", city.id);
    const state = { ...window.history.state };
    // Let Next notify useSearchParams; passing its internal navigation marker
    // would bypass that notification. Its wrapper restores the router state.
    delete state.__NA;
    delete state._N;
    window.history.replaceState(state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [city.id, variant, searchParams]);
  return (
    <div className="flex min-w-0 flex-col gap-4" data-weather-city={city.id}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label htmlFor={selectId} className="text-sm font-bold text-ink">Град</label>
        <select
          id={selectId}
          value={city.id}
          onChange={(event) => selectCity(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-base font-semibold text-ink outline-none focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:max-w-72"
        >
          {WEATHER_CITIES.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
        <p role="status" className="basis-full text-sm text-muted sm:basis-auto">
          {loading ? `Зареждаме прогнозата за ${city.name}…` : `Прогноза за ${city.name}`}
        </p>
      </div>
      {error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <p>{error}</p>
        <button type="button" onClick={retry} className="min-h-11 rounded-xl border border-line px-4 font-bold text-link hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Опитай отново</button>
      </div> : null}
      <div aria-busy={loading}>
        {loading && !data.payload ? (
          <div className="flex min-h-52 items-center justify-center rounded-2xl border border-line bg-surface-2 px-5 text-sm text-muted">Зареждане на времето за {city.name}…</div>
        ) : <WeatherContent data={data} variant={variant} mobile={mobile} />}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Прогнозни данни: <a href="https://www.met.no/" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">MET Norway</a>, обобщени от NewsPoint. Координати: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">GeoNames</a>. Лиценз <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">CC BY 4.0</a>.
      </p>
    </div>
  );
}

function WeatherContent({ data, variant, mobile }: { data: DataEnvelope<WeatherForecast>; variant: "panel" | "page"; mobile: boolean }) {
  const forecast = data.payload;

  const mood = useMemo(() => {
    if (!forecast) return "fair" as const;
    const hour = Number(hourInSofia.format(new Date(forecast.current.time)));
    return skyMood(forecast.current.symbolCode, hour);
  }, [forecast]);

  if (!forecast) {
    return (
      <div className="py-2">
        <p className="text-base font-semibold text-ink">Няма актуална прогноза</p>
        <p className="mt-2 text-sm text-muted">{data.message ?? "Източникът още се свързва."}</p>
      </div>
    );
  }

  const windDir = windDirectionLabel(forecast.current.windFromDegrees);
  const tall = variant === "page";

  if (tall) {
    const stale = data.status === "stale" && data.message ? data.message : null;
    return <WeatherPageView forecast={forecast} {...(stale ? { staleMessage: stale } : {})} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {data.status === "stale" && data.message ? <p className="text-sm text-muted">{data.message}</p> : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div data-mood={mood} className="np-lp-window relative isolate min-h-52 overflow-hidden rounded-2xl bg-[#0a1454]">
          {forecast.cityId === "plovdiv" ? <img src={PLOVDIV_VIEW} alt="" className="absolute inset-0 size-full object-cover" /> : null}
          <div className="np-lp-window-veil absolute inset-0" aria-hidden="true" />
          <div className="relative flex min-h-52 flex-col justify-end px-5 py-5 sm:px-6 sm:py-6">
            <p className="text-sm font-semibold text-white/80">{forecast.place}</p>
            <p className="mt-1 text-6xl font-extrabold tracking-tight text-white">{formatTempC(forecast.current.temperatureC)}</p>
            <p className="mt-1 text-lg font-bold text-white">{weatherLabel(forecast.current.symbolCode)}</p>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-white/85">
              {forecast.current.humidityPct != null ? <li>Влажност {Math.round(forecast.current.humidityPct)}%</li> : null}
              {forecast.current.windSpeedMs != null ? (
                <li>
                  Вятър {formatWindMs(forecast.current.windSpeedMs)}
                  {windDir ? ` ${windDir}` : ""}
                </li>
              ) : null}
              {forecast.current.precipitationMm != null ? <li>Валеж {forecast.current.precipitationMm} мм/ч</li> : null}
              {forecast.current.pressureHpa != null ? <li>Налягане {Math.round(forecast.current.pressureHpa)} hPa</li> : null}
            </ul>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          {mobile ? <MobileWeatherHours hours={forecast.hours} /> : <WeatherChart hours={forecast.hours} />}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold tracking-[0.12em] text-muted uppercase">Следващи дни</h3>
        <ul className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-6">
          {forecast.days.map((day) => (
            <li key={day.date}>
              <p className="text-xs font-bold text-muted capitalize">{dayLabel.format(new Date(`${day.date}T12:00:00Z`))}</p>
              <p className="mt-0.5 text-sm font-extrabold text-ink">
                {formatTempC(day.tempMaxC)}
                <span className="font-semibold text-muted"> / {formatTempC(day.tempMinC)}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">{weatherLabel(day.symbolCode)}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted">
        Обновена {formatFull(new Date(forecast.updatedAt))} · текущ час {formatTime(new Date(forecast.current.time))}
      </p>
    </div>
  );
}
