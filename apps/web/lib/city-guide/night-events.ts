export type CityNightEvent = { key: string; title: string; startDate: string; endDate: string; place: string; status: string; price?: number };

const dayKey = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Sofia" });
const nightHour = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Sofia" });

export function nightPeriodMatches(event: CityNightEvent, period: string, now: Date): boolean {
  const startMs = Date.parse(event.startDate);
  const endMs = Date.parse(event.endDate);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs <= now.getTime()) return false;
  const start = new Date(startMs);
  const today = dayKey.format(now);
  const day = dayKey.format(start);
  if (period === "Сега и после") return true;
  if (period === "Днес") return day === today || (startMs <= now.getTime() && dayKey.format(new Date(endMs)) === today);
  if (period === "Тази вечер") return day === today && Number(nightHour.format(start)) >= 18;
  if (period === "7 дни") return startMs <= now.getTime() + 7 * 24 * 60 * 60_000;
  if (period === "Безплатно") return event.price === 0;
  if (period === "Уикенд") {
    const dayNumber = new Date(`${today}T12:00:00Z`).getUTCDay();
    const fridayOffset = dayNumber === 6 ? -1 : dayNumber === 0 ? -2 : (5 - dayNumber + 7) % 7;
    const friday = new Date(`${today}T12:00:00Z`);
    friday.setUTCDate(friday.getUTCDate() + fridayOffset);
    const sunday = new Date(friday);
    sunday.setUTCDate(sunday.getUTCDate() + 2);
    return day >= friday.toISOString().slice(0, 10) && day <= sunday.toISOString().slice(0, 10);
  }
  return false;
}

export function nightEventStatusLabel(event: CityNightEvent, now: Date): string {
  if (event.status === "EventCancelled") return "ОТМЕНЕНО";
  if (event.status === "EventPostponed") return "ОТЛОЖЕНО";
  if (event.status === "EventRescheduled") return "ПРЕНАСРОЧЕНО";
  return Date.parse(event.startDate) <= now.getTime() && Date.parse(event.endDate) > now.getTime() ? "В МОМЕНТА" : "В ПРОГРАМАТА";
}
