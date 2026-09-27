"use client";

import { useMemo } from "react";
import type { WeatherDay, WeatherForecast } from "@/lib/livepoint/types";
import {
  formatTempC,
  formatWindMs,
  skyMood,
  weatherLabel,
  windDirectionLabel,
  type SkyMood,
} from "@/lib/livepoint/weather/labels";
import { formatFull, formatTime } from "@/lib/format";
import { WeatherChart } from "./weather-chart";
import { WeatherSymbolIcon } from "./weather-symbol-icon";

const hourInSofia = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Sofia",
  hour: "numeric",
  hour12: false,
});

const hourFmt = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  hour: "2-digit",
  minute: "2-digit",
});

const dayLabel = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  weekday: "short",
  day: "numeric",
});

const PLOVDIV_VIEW = "/brand/plovdiv-aerial.webp";

function cloudPct(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function precipSum24(hours: WeatherForecast["hours"]): number {
  return Math.round(hours.slice(0, 24).reduce((sum, h) => sum + (h.precipitationMm ?? 0), 0) * 10) / 10;
}

function StatGlass({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-md">
      <p className="text-[10px] font-bold tracking-[0.14em] text-white/65 uppercase">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-white/70">{hint}</p> : null}
    </div>
  );
}

function WindCompass({ degrees, speedLabel, dirLabel }: { degrees: number | null; speedLabel: string; dirLabel: string | null }) {
  const rotation = degrees != null ? (degrees + 180) % 360 : 0;
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-card backdrop-blur-md">
      <p className="text-[10px] font-bold tracking-[0.14em] text-white/70 uppercase">Вятър</p>
      <div className="relative size-28 rounded-full border border-white/25 bg-black/15">
        <span className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[10px] font-bold text-white/75">С</span>
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/75">Ю</span>
        <span className="absolute top-1/2 left-1.5 -translate-y-1/2 text-[10px] font-bold text-white/75">З</span>
        <span className="absolute top-1/2 right-1.5 -translate-y-1/2 text-[10px] font-bold text-white/75">И</span>
        <div
          className="absolute inset-4 flex items-center justify-center transition-transform duration-700 ease-out"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className="h-10 w-1 rounded-full bg-gradient-to-b from-amber-200 to-white" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="size-2 rounded-full bg-white/40" />
        </div>
      </div>
      <p className="text-center text-sm font-extrabold text-white">{speedLabel}</p>
      {dirLabel ? <p className="text-center text-xs text-white/75">от {dirLabel}</p> : null}
    </div>
  );
}

function CloudRing({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-card backdrop-blur-md">
      <p className="text-[10px] font-bold tracking-[0.14em] text-white/70 uppercase">Облачност</p>
      <svg viewBox="0 0 88 88" className="size-28 text-amber-200">
        <circle cx="44" cy="44" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 44 44)"
          className="np-weather-ring-draw"
        />
        <text x="44" y="48" textAnchor="middle" className="fill-white text-[14px] font-extrabold">
          {pct}%
        </text>
      </svg>
    </div>
  );
}

function DayCard({ day, scaleMin, scaleMax }: { day: WeatherDay; scaleMin: number; scaleMax: number }) {
  const span = Math.max(1, scaleMax - scaleMin);
  const left = ((day.tempMinC - scaleMin) / span) * 100;
  const width = Math.max(8, ((day.tempMaxC - day.tempMinC) / span) * 100);
  const mood = skyMood(day.symbolCode, 14);

  return (
    <li className="group rounded-2xl border border-line bg-surface p-3 shadow-card transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-muted capitalize">{dayLabel.format(new Date(`${day.date}T12:00:00Z`))}</p>
        <WeatherSymbolIcon symbolCode={day.symbolCode} mood={mood} className="size-9 opacity-90" />
      </div>
      <p className="mt-2 text-xl font-extrabold tracking-tight text-ink">
        {formatTempC(day.tempMaxC)}
        <span className="text-base font-semibold text-muted"> / {formatTempC(day.tempMinC)}</span>
      </p>
      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="absolute h-full rounded-full bg-gradient-to-r from-sky-400 to-logo transition-all duration-500"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted">{weatherLabel(day.symbolCode)}</p>
      {day.precipitationMm != null && day.precipitationMm > 0 ? (
        <p className="mt-1 text-[11px] font-semibold text-sky-700 dark:text-sky-400">Валеж {day.precipitationMm} мм</p>
      ) : null}
    </li>
  );
}

export function WeatherPageView({ forecast, staleMessage }: { forecast: WeatherForecast; staleMessage?: string }) {
  const mood: SkyMood = useMemo(() => {
    const hour = Number(hourInSofia.format(new Date(forecast.current.time)));
    return skyMood(forecast.current.symbolCode, hour);
  }, [forecast]);

  const windDir = windDirectionLabel(forecast.current.windFromDegrees);
  const clouds = cloudPct(forecast.current.cloudAreaPct);
  const sum24 = precipSum24(forecast.hours);
  const dayScale = useMemo(() => {
    const mins = forecast.days.map((d) => d.tempMinC);
    const maxs = forecast.days.map((d) => d.tempMaxC);
    return { min: Math.min(...mins), max: Math.max(...maxs) };
  }, [forecast.days]);

  const pressureHint =
    forecast.current.pressureHpa != null ? `${Math.round(forecast.current.pressureHpa)} hPa` : "—";

  return (
    <div className="np-weather-page flex flex-col gap-4">
      {staleMessage ? <p className="text-sm text-muted">{staleMessage}</p> : null}

      <section
        data-mood={mood}
        className="np-weather-hero np-lp-window relative isolate overflow-hidden rounded-3xl border border-line shadow-card"
      >
        <img src={PLOVDIV_VIEW} alt="" className="absolute inset-0 size-full scale-105 object-cover np-weather-hero-zoom" />
        <div className="np-lp-window-veil absolute inset-0" aria-hidden="true" />
        <div className="np-weather-sky-fx pointer-events-none absolute inset-0" aria-hidden="true" data-mood={mood} />

        <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.85fr)] lg:p-8">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-white/75 uppercase">Пловдив · LivePoint</p>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <p className="text-[4.5rem] font-extrabold leading-none tracking-tighter text-white sm:text-[5.5rem]">
                {formatTempC(forecast.current.temperatureC)}
              </p>
              <div className="pb-2">
                <p className="text-xl font-bold text-white sm:text-2xl">{weatherLabel(forecast.current.symbolCode)}</p>
                <p className="mt-1 text-sm text-white/80">
                  Модел · {formatTime(new Date(forecast.current.time))}
                </p>
              </div>
              <WeatherSymbolIcon symbolCode={forecast.current.symbolCode} mood={mood} className="ml-auto size-20 sm:size-24" animated />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3">
              {forecast.current.humidityPct != null ? (
                <StatGlass label="Влажност" value={`${Math.round(forecast.current.humidityPct)}%`} />
              ) : null}
              {forecast.current.windSpeedMs != null ? (
                <StatGlass
                  label="Вятър"
                  value={formatWindMs(forecast.current.windSpeedMs)}
                  {...(windDir ? { hint: `от ${windDir}` } : {})}
                />
              ) : null}
              {clouds != null ? <StatGlass label="Облаци" value={`${clouds}%`} /> : null}
              {forecast.current.pressureHpa != null ? <StatGlass label="Налягане" value={pressureHint} /> : null}
              {forecast.current.precipitationMm != null ? (
                <StatGlass label="Валеж сега" value={`${forecast.current.precipitationMm} мм/ч`} />
              ) : null}
              <StatGlass label="Валеж 24 ч" value={`${sum24} мм`} hint="сума от часовата прогноза" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 self-end">
            <WindCompass
              degrees={forecast.current.windFromDegrees}
              speedLabel={forecast.current.windSpeedMs != null ? formatWindMs(forecast.current.windSpeedMs) : "—"}
              dirLabel={windDir}
            />
            <CloudRing pct={clouds} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-xs font-bold tracking-[0.14em] text-logo uppercase">24 часа напред</h2>
        </div>
        <ul className="np-scroll-soft flex gap-2 overflow-x-auto px-3 py-3 sm:px-4">
          {forecast.hours.slice(0, 24).map((hour) => {
            const h = Number(hourInSofia.format(new Date(hour.time)));
            const hm = skyMood(hour.symbolCode, h);
            return (
              <li
                key={hour.time}
                className="min-w-[4.5rem] shrink-0 rounded-xl border border-line bg-surface-2 px-2 py-2.5 text-center transition-colors hover:border-accent/40"
              >
                <p className="text-[10px] font-bold text-muted">{hourFmt.format(new Date(hour.time))}</p>
                <div className="mx-auto mt-1 flex justify-center">
                  <WeatherSymbolIcon symbolCode={hour.symbolCode} mood={hm} className="size-8" />
                </div>
                <p className="mt-1 text-sm font-extrabold text-ink">{formatTempC(hour.temperatureC)}</p>
                {(hour.precipitationMm ?? 0) > 0 ? (
                  <p className="mt-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">{hour.precipitationMm} мм</p>
                ) : (
                  <p className="mt-0.5 text-[10px] text-muted">—</p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line p-4 sm:p-5">
          <WeatherChart hours={forecast.hours} size="large" hoursCount={24} title="Температура и валеж · 24 ч" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold tracking-[0.14em] text-muted uppercase">7 дни</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {forecast.days.map((day) => (
            <DayCard key={day.date} day={day} scaleMin={dayScale.min} scaleMax={dayScale.max} />
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted">
        Обновена {formatFull(new Date(forecast.updatedAt))} · текущ моделен час {formatTime(new Date(forecast.current.time))}
      </p>
    </div>
  );
}
