"use client";

import { useId, useMemo, useState } from "react";
import type { WeatherHour } from "@/lib/livepoint/types";
import { formatTempC, weatherLabel } from "@/lib/livepoint/weather/labels";

const hourFmt = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  hour: "2-digit",
  minute: "2-digit",
});

const W = 720;
const H = 200;
const PAD = { l: 8, r: 8, t: 16, b: 36 };
const TEMP_BOTTOM = 148;
const PRECIP_TOP = 158;
const PRECIP_H = 28;

function xAt(index: number, count: number): number {
  const inner = W - PAD.l - PAD.r;
  if (count <= 1) return PAD.l + inner / 2;
  return PAD.l + (index / (count - 1)) * inner;
}

/** Temperature area chart with precip lane — full width, no stroke-dash glitches. */
export function WeatherChart({
  hours,
  size = "default",
  hoursCount = 12,
  title = "Следващите часове",
}: {
  hours: WeatherHour[];
  size?: "default" | "large";
  hoursCount?: number;
  title?: string;
}) {
  const gradientId = useId();
  const lineGlowId = useId();
  const [active, setActive] = useState(0);
  const [tipOpen, setTipOpen] = useState(false);
  const slice = hours.slice(0, hoursCount);

  const layout = useMemo(() => {
    if (!slice.length) return null;
    const temps = slice.map((h) => h.temperatureC);
    let lo = Math.min(...temps);
    let hi = Math.max(...temps);
    if (hi - lo < 2) {
      lo -= 1;
      hi += 1;
    } else {
      lo -= 0.5;
      hi += 0.5;
    }
    const span = Math.max(0.5, hi - lo);
    const tempH = TEMP_BOTTOM - PAD.t;

    const points = slice.map((hour, index) => {
      const x = xAt(index, slice.length);
      const y = PAD.t + (1 - (hour.temperatureC - lo) / span) * tempH;
      return { x, y, hour };
    });

    const maxPrecip = Math.max(0.15, ...slice.map((h) => h.precipitationMm ?? 0));
    const precipBars = points.map((p, index) => {
      const mm = slice[index]?.precipitationMm ?? 0;
      const h = (mm / maxPrecip) * PRECIP_H;
      return { x: p.x, h, mm };
    });

    const line = points.map((p) => `${p.x},${p.y}`).join(" ");
    const area = `${PAD.l},${TEMP_BOTTOM} ${line} ${points[points.length - 1]!.x},${TEMP_BOTTOM} ${PAD.l},${TEMP_BOTTOM}`;

    const gridYs = [0, 0.25, 0.5, 0.75, 1].map((t) => PAD.t + (1 - t) * tempH);
    const gridLabels = [hi, lo + span * 0.75, lo + span * 0.5, lo + span * 0.25, lo].map((t) => Math.round(t));

    const tickStep = size === "large" && slice.length > 12 ? 3 : slice.length > 8 ? 2 : 1;
    const ticks = points
      .map((p, index) => ({ ...p, index }))
      .filter((_, index) => index % tickStep === 0 || index === slice.length - 1);

    return { points, precipBars, line, area, lo, hi, gridYs, gridLabels, ticks, maxPrecip };
  }, [slice, size]);

  if (!slice.length || !layout) return <p className="text-sm text-muted">Няма часова прогноза.</p>;

  const current = slice[Math.min(active, slice.length - 1)]!;
  const activePt = layout.points[Math.min(active, layout.points.length - 1)]!;
  const aspect = size === "large" ? "aspect-[18/5] min-h-[11rem]" : "aspect-[18/5] min-h-[9rem]";
  const tipLeftPct = (activePt.x / W) * 100;
  const tipTopPct = (activePt.y / H) * 100;
  const tipAbove = tipTopPct > 28;

  return (
    <div className="select-none">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">{title}</p>
        <p className="rounded-full border border-line bg-surface-2 px-3 py-1 text-sm font-extrabold text-ink tabular-nums">
          {hourFmt.format(new Date(current.time))} · {formatTempC(current.temperatureC)}
          {(current.precipitationMm ?? 0) > 0 ? (
            <span className="font-semibold text-sky-600 dark:text-sky-400"> · {current.precipitationMm} мм</span>
          ) : null}
        </p>
      </div>

      <div
        className="relative rounded-xl border border-line/80 bg-gradient-to-b from-surface to-surface-2/80 p-2 sm:p-3"
        onMouseLeave={() => setTipOpen(false)}
      >
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex h-[calc(100%-2.5rem)] flex-col justify-between text-[10px] font-bold text-muted tabular-nums sm:left-4">
          {layout.gridLabels.map((label, i) => (
            <span key={`${label}-${i}`}>{label}°</span>
          ))}
        </div>
        <div className={`relative ${aspect} w-full`}>
          {tipOpen ? (
            <div
              className="np-weather-chart-tip pointer-events-none absolute z-20 min-w-[9.5rem] max-w-[12rem]"
              data-placement={tipAbove ? "above" : "below"}
              style={{
                left: `clamp(12%, ${tipLeftPct}%, 88%)`,
                top: `${tipTopPct}%`,
                transform: tipAbove ? "translate(-50%, calc(-100% - 10px))" : "translate(-50%, 14px)",
              }}
              role="tooltip"
            >
              <p className="text-[10px] font-bold tracking-[0.12em] text-white/75 uppercase tabular-nums">
                {hourFmt.format(new Date(current.time))}
              </p>
              <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-white tabular-nums">
                {formatTempC(current.temperatureC)}
              </p>
              <p className="mt-1 text-xs font-semibold leading-snug text-white/90">{weatherLabel(current.symbolCode)}</p>
              {(current.precipitationMm ?? 0) > 0 ? (
                <p className="mt-2 inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold text-sky-100">
                  Валеж {current.precipitationMm} мм/ч
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-white/60">Без валеж</p>
              )}
            </div>
          ) : null}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 size-full text-logo"
            role="img"
            aria-label="Часова температура и валеж"
          >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={lineGlowId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#3818d6" />
              <stop offset="55%" stopColor="#2660fb" />
              <stop offset="100%" stopColor="#990fec" />
            </linearGradient>
          </defs>

          {layout.gridYs.map((y, i) => (
            <line key={y} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
          ))}

          <line x1={PAD.l} y1={TEMP_BOTTOM} x2={W - PAD.r} y2={TEMP_BOTTOM} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
          <text x={PAD.l + 4} y={PRECIP_TOP - 6} className="fill-muted text-[10px] font-bold uppercase">
            мм/ч
          </text>

          {layout.precipBars.map((bar, index) =>
            bar.h > 0.5 ? (
              <rect
                key={`p-${index}`}
                x={bar.x - 3}
                y={PRECIP_TOP + (PRECIP_H - bar.h)}
                width="6"
                height={bar.h}
                rx="2"
                className="fill-sky-500/35"
              />
            ) : null,
          )}

          <polygon fill={`url(#${gradientId})`} points={layout.area} />
          <polyline
            fill="none"
            stroke={`url(#${lineGlowId})`}
            strokeWidth={size === "large" ? 3.5 : 2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={layout.line}
          />

          {activePt ? (
            <line
              x1={activePt.x}
              y1={PAD.t}
              x2={activePt.x}
              y2={TEMP_BOTTOM}
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ) : null}

          {layout.points.map((dot, index) => (
            <g key={dot.hour.time}>
              <circle
                cx={dot.x}
                cy={dot.y}
                r={14}
                fill="transparent"
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`${hourFmt.format(new Date(dot.hour.time))}: ${formatTempC(dot.hour.temperatureC)}`}
                onMouseEnter={() => {
                  setActive(index);
                  setTipOpen(true);
                }}
                onFocus={() => {
                  setActive(index);
                  setTipOpen(true);
                }}
              />
              <circle
                cx={dot.x}
                cy={dot.y}
                r={active === index ? 9 : 0}
                className="fill-logo/15 transition-all duration-200 pointer-events-none"
              />
              <circle
                cx={dot.x}
                cy={dot.y}
                r={active === index ? 5 : 3.5}
                className="pointer-events-none fill-white stroke-logo stroke-[2.5] transition-all duration-200"
                tabIndex={-1}
              />
            </g>
          ))}

          {layout.ticks.map((tick) => (
            <text
              key={tick.hour.time}
              x={tick.x}
              y={H - 8}
              textAnchor="middle"
              className="fill-muted text-[11px] font-semibold tabular-nums"
            >
              {hourFmt.format(new Date(tick.hour.time))}
            </text>
          ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
