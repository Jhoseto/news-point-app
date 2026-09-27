/** Bulgarian labels for symbol_code values we actually receive. */
const SYMBOL_LABELS: Record<string, string> = {
  clearsky_day: "Ясно",
  clearsky_night: "Ясно",
  clearsky_polarday: "Ясно",
  fair_day: "Предимно ясно",
  fair_night: "Предимно ясно",
  fair_polarday: "Предимно ясно",
  partlycloudy_day: "Частична облачност",
  partlycloudy_night: "Частична облачност",
  partlycloudy_polarday: "Частична облачност",
  cloudy: "Облачно",
  fog: "Мъгла",
  lightrain: "Слаб дъжд",
  lightrainshowers_day: "Слаби превалявания",
  lightrainshowers_night: "Слаби превалявания",
  rain: "Дъжд",
  rainshowers_day: "Превалявания",
  rainshowers_night: "Превалявания",
  heavyrain: "Силен дъжд",
  heavyrainshowers_day: "Силни превалявания",
  heavyrainshowers_night: "Силни превалявания",
  lightsleet: "Слаба суграшица",
  sleet: "Суграшица",
  lightsnow: "Слаб сняг",
  snow: "Сняг",
  heavysnow: "Силен сняг",
  lightsnowshowers_day: "Слаби снеговалежи",
  lightsnowshowers_night: "Слаби снеговалежи",
  snowshowers_day: "Снеговалежи",
  snowshowers_night: "Снеговалежи",
};

export function weatherLabel(symbolCode: string | null | undefined): string {
  if (!symbolCode) return "Прогноза";
  return SYMBOL_LABELS[symbolCode] ?? SYMBOL_LABELS[symbolCode.replace(/_(day|night|polarday)$/, "")] ?? "Прогноза";
}

export type SkyMood = "clear" | "fair" | "cloudy" | "rain" | "snow" | "fog" | "night";

export function skyMood(symbolCode: string | null | undefined, hourInSofia: number): SkyMood {
  const code = symbolCode ?? "";
  const isNight = code.includes("_night") || hourInSofia < 6 || hourInSofia >= 21;
  if (code.includes("fog")) return "fog";
  if (code.includes("snow") || code.includes("sleet")) return "snow";
  if (code.includes("rain") || code.includes("thunder")) return "rain";
  if (code.includes("cloudy") && !code.includes("partly") && !code.includes("fair")) return isNight ? "night" : "cloudy";
  if (code.includes("partlycloudy") || code.includes("fair")) return isNight ? "night" : "fair";
  if (code.includes("clearsky")) return isNight ? "night" : "clear";
  return isNight ? "night" : "fair";
}

export function windDirectionLabel(degrees: number | null): string | null {
  if (degrees == null || !Number.isFinite(degrees)) return null;
  const dirs = ["С", "СИ", "И", "ЮИ", "Ю", "ЮЗ", "З", "СЗ"] as const;
  const idx = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return dirs[idx]!;
}

export function formatTempC(value: number): string {
  return `${Math.round(value)}°`;
}

export function formatWindMs(value: number): string {
  return `${value.toFixed(1).replace(/\.0$/, "")} м/с`;
}
