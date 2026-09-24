"use client";

import { useId, useMemo, useState } from "react";
import type { WeatherHour } from "@/lib/livepoint/types";
import { formatTempC } from "@/lib/livepoint/weather/labels";

const hourFmt = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  hour: "2-digit",
  minute: "2-digit",
});

/** Temperature line and rain bars in the site's ink and logo colours. */
export function WeatherChart({ hours }: { hours: WeatherHour[] }) {
  const gradientId = useId();
  const [active, setActive] = useState(0);
  const slice = hours.slice(0, 12);

  const { points, precipBars, dots, min, max } = useMemo(() => {
    if (!slice.length) {
      return { points: "", precipBars: [] as { x: number; h: number }[], dots: [] as { x: number; y: number; hour: WeatherHour }[], min: 0, max: 1 };
    }
    const temps = slice.map((h) => h.temperatureC);
    const lo = Math.min(...temps);
    const hi = Math.max(...temps);
    const span = Math.max(1, hi - lo);
    const dots = slice.map((hour, index) => ({
      x: (index / Math.max(1, slice.length - 1)) * 100,
      y: 78 - ((hour.temperatureC - lo) / span) * 58,
      hour,
    }));
    const maxPrecip = Math.max(0.2, ...slice.map((h) => h.precipitationMm ?? 0));
    return {
      points: dots.map((d) => `${d.x},${d.y}`).join(" "),
      precipBars: dots.map((d, index) => ({ x: d.x, h: ((slice[index]?.precipitationMm ?? 0) / maxPrecip) * 28 })),
      dots,
      min: lo,
      max: hi,
    };
  }, [slice]);

  if (!slice.length) return <p className="text-sm text-muted">Няма часова прогноза.</p>;

  const current = slice[Math.min(active, slice.length - 1)]!;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Следващите часове</p>
        <p className="text-sm font-bold text-ink">
          {hourFmt.format(new Date(current.time))} · {formatTempC(current.temperatureC)}
          {current.precipitationMm != null && current.precipitationMm > 0 ? ` · ${current.precipitationMm} мм` : ""}
        </p>
      </div>
      <svg viewBox="0 0 100 100" className="h-36 w-full text-logo" role="img" aria-label="Часова температура и валеж">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon fill={`url(#${gradientId})`} points={`0,100 ${points} 100,100`} />
        {precipBars.map((bar, index) => (
          <rect key={`p-${index}`} x={bar.x - 1.1} y={100 - bar.h} width="2.2" height={bar.h} rx="0.6" className="fill-muted" opacity="0.35" />
        ))}
        <polyline fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" points={points} />
        {dots.map((dot, index) => (
          <circle
            key={dot.hour.time}
            cx={dot.x}
            cy={dot.y}
            r={active === index ? 2.3 : 1.35}
            fill="currentColor"
            className="cursor-pointer"
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            tabIndex={0}
            role="listitem"
            aria-label={`${hourFmt.format(new Date(dot.hour.time))}: ${formatTempC(dot.hour.temperatureC)}`}
          />
        ))}
        <text x="0" y="10" className="fill-muted text-[3px]">
          {formatTempC(max)}
        </text>
        <text x="0" y="96" className="fill-muted text-[3px]">
          {formatTempC(min)}
        </text>
      </svg>
      <div className="mt-0.5 flex justify-between text-[0.65rem] font-medium text-muted">
        <span>{hourFmt.format(new Date(slice[0]!.time))}</span>
        <span>{hourFmt.format(new Date(slice[slice.length - 1]!.time))}</span>
      </div>
    </div>
  );
}
