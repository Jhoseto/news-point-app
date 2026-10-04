import type { WeatherHour } from "@/lib/livepoint/types";
import { formatTime } from "@/lib/format";
import { formatTempC, skyMood, weatherLabel } from "@/lib/livepoint/weather/labels";
import { WeatherSymbolIcon } from "./weather-symbol-icon";

const localHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", hour: "numeric", hour12: false });

export function MobileWeatherHours({ hours }: { hours: WeatherHour[] }) {
  if (!hours.length) return <p className="text-sm text-muted">Няма почасова прогноза от източника.</p>;
  return <section className="np-mobile-lp-hours" aria-label="Почасова прогноза">
    <h3>Следващите часове<span>Плъзнете за още →</span></h3>
    <ul>{hours.slice(0, 12).map(hour => <li key={hour.time}>
      <time dateTime={hour.time}>{formatTime(new Date(hour.time))}</time>
      <WeatherSymbolIcon symbolCode={hour.symbolCode} mood={skyMood(hour.symbolCode, Number(localHour.format(new Date(hour.time))))} className="np-mobile-lp-hour-icon" />
      <strong>{formatTempC(hour.temperatureC)}</strong>
      <span className="sr-only">{weatherLabel(hour.symbolCode)}</span>
      {hour.precipitationMm !== null ? <small>{hour.precipitationMm} мм</small> : null}
    </li>)}</ul>
  </section>;
}
