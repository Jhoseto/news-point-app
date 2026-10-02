import { z } from "zod";
import { PLOVDIV } from "../config";
import type { WeatherDay, WeatherForecast, WeatherHour, WeatherInstant } from "../types";

const detailsSchema = z
  .object({
    air_temperature: z.number().optional(),
    relative_humidity: z.number().optional(),
    wind_speed: z.number().optional(),
    wind_from_direction: z.number().optional(),
    cloud_area_fraction: z.number().optional(),
    air_pressure_at_sea_level: z.number().optional(),
    precipitation_amount: z.number().optional(),
  })
  .passthrough();

const periodSchema = z
  .object({
    summary: z.object({ symbol_code: z.string().optional() }).optional(),
    details: detailsSchema.optional(),
  })
  .optional();

const timeseriesEntrySchema = z.object({
  time: z.string(),
  data: z.object({
    instant: z.object({ details: detailsSchema }),
    next_1_hours: periodSchema,
    next_6_hours: periodSchema,
    next_12_hours: periodSchema,
  }),
});

export const metCompactSchema = z.object({
  type: z.literal("Feature"),
  properties: z.object({
    meta: z.object({
      updated_at: z.string(),
      units: z.record(z.string(), z.string()).optional(),
    }),
    timeseries: z.array(timeseriesEntrySchema).min(1),
  }),
});

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: PLOVDIV.timeZone });

function symbolOf(entry: z.infer<typeof timeseriesEntrySchema>): string | null {
  return (
    entry.data.next_1_hours?.summary?.symbol_code ??
    entry.data.next_6_hours?.summary?.symbol_code ??
    entry.data.next_12_hours?.summary?.symbol_code ??
    null
  );
}

function precipOf(entry: z.infer<typeof timeseriesEntrySchema>): number | null {
  const amount = entry.data.next_1_hours?.details?.precipitation_amount;
  return typeof amount === "number" ? amount : null;
}

export function parseMetCompact(raw: unknown, now = new Date()): WeatherForecast {
  const parsed = metCompactSchema.parse(raw);
  const series = parsed.properties.timeseries;
  const currentEntry = series[0]!;
  const details = currentEntry.data.instant.details;
  if (typeof details.air_temperature !== "number") {
    throw new Error("Forecast response has no air_temperature");
  }

  const current: WeatherInstant = {
    time: currentEntry.time,
    temperatureC: details.air_temperature,
    symbolCode: symbolOf(currentEntry),
    humidityPct: details.relative_humidity ?? null,
    windSpeedMs: details.wind_speed ?? null,
    windFromDegrees: details.wind_from_direction ?? null,
    cloudAreaPct: details.cloud_area_fraction ?? null,
    pressureHpa: details.air_pressure_at_sea_level ?? null,
    precipitationMm: precipOf(currentEntry),
  };

  const hours: WeatherHour[] = series.slice(0, 24).flatMap((entry) => {
    const temp = entry.data.instant.details.air_temperature;
    if (typeof temp !== "number") return [];
    return [
      {
        time: entry.time,
        temperatureC: temp,
        symbolCode: symbolOf(entry),
        precipitationMm: precipOf(entry),
      },
    ];
  });

  const byDay = new Map<string, { temps: number[]; symbols: string[]; precip: number }>();
  for (const entry of series) {
    const temp = entry.data.instant.details.air_temperature;
    if (typeof temp !== "number") continue;
    const key = dayKey.format(new Date(entry.time));
    const bucket = byDay.get(key) ?? { temps: [], symbols: [], precip: 0 };
    bucket.temps.push(temp);
    const symbol = symbolOf(entry);
    if (symbol) bucket.symbols.push(symbol);
    const precip = precipOf(entry);
    if (typeof precip === "number") bucket.precip += precip;
    byDay.set(key, bucket);
  }

  const today = dayKey.format(now);
  const days: WeatherDay[] = [...byDay.entries()]
    .filter(([date]) => date >= today)
    .slice(0, 6)
    .map(([date, bucket]) => ({
      date,
      symbolCode: bucket.symbols[Math.floor(bucket.symbols.length / 2)] ?? null,
      tempMinC: Math.min(...bucket.temps),
      tempMaxC: Math.max(...bucket.temps),
      precipitationMm: bucket.precip > 0 ? Math.round(bucket.precip * 10) / 10 : 0,
    }));

  return {
    place: PLOVDIV.name,
    updatedAt: parsed.properties.meta.updated_at,
    current,
    hours,
    days,
  };
}
