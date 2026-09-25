"use client";

import { useEffect, useMemo, useState } from "react";
import type { DataEnvelope, WeatherForecast } from "@/lib/livepoint/types";
import { formatTempC, formatWindMs, skyMood, weatherLabel, windDirectionLabel } from "@/lib/livepoint/weather/labels";
import { formatFull, formatTime } from "@/lib/format";
import { WeatherChart } from "./weather-chart";

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

export function WeatherPanel({ initial, variant = "panel" }: { initial: DataEnvelope<WeatherForecast>; variant?: "panel" | "page" }) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    if (variant !== "panel") return;
    const controller = new AbortController();
    fetch("/api/livepoint/weather/", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("weather unavailable");
        return response.json() as Promise<DataEnvelope<WeatherForecast>>;
      })
      .then((next) => setData(next))
      .catch(() => { /* Keep the server-rendered forecast if refresh fails. */ });
    return () => controller.abort();
  }, [variant]);
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

  return (
    <div className="flex flex-col gap-5">
      {data.status === "stale" && data.message ? <p className="text-sm text-muted">{data.message}</p> : null}

      <div className={tall ? "flex flex-col gap-5" : "grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"}>
        <div
          data-mood={mood}
          className={`np-lp-window relative isolate overflow-hidden rounded-2xl ${tall ? "min-h-72" : "min-h-52"}`}
        >
          <img src={PLOVDIV_VIEW} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="np-lp-window-veil absolute inset-0" aria-hidden="true" />
          <div className={`relative flex flex-col justify-end px-5 py-5 sm:px-6 sm:py-6 ${tall ? "min-h-72" : "min-h-52"}`}>
            <p className="text-sm font-semibold text-white/80">Пловдив · прогноза</p>
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
        <div className={tall ? "" : "rounded-2xl border border-line bg-surface-2 p-4"}>
          <WeatherChart hours={forecast.hours} />
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
        Прогноза · обновена {formatFull(new Date(forecast.updatedAt))} ·{" "}
        <a href={forecast.attribution.url} className="font-semibold text-link" target="_blank" rel="noreferrer">
          {forecast.attribution.name}
        </a>
        {" · "}
        <a href={forecast.attribution.licenseUrl} className="text-link" target="_blank" rel="noreferrer">
          лиценз
        </a>
        {" · "}
        {formatTime(new Date(forecast.current.time))}
      </p>
    </div>
  );
}
