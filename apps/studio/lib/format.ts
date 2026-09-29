const TIME_ZONE = "Europe/Sofia";

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const time = new Intl.DateTimeFormat("bg-BG", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const date = new Intl.DateTimeFormat("bg-BG", { timeZone: TIME_ZONE, day: "numeric", month: "short" });

/** "09:41" today, otherwise "23 септ., 09:41". */
export function formatWhen(value: Date | string, now = new Date()): string {
  const at = new Date(value);
  const clock = time.format(at);
  return dayKey.format(at) === dayKey.format(now) ? clock : `${date.format(at)}, ${clock}`;
}

const stamp = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "29.09.2026, 08:11" in Europe/Sofia. Month is a number. */
export function formatStamp(value: Date | string): string {
  const parts = stamp.formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}, ${get("hour")}:${get("minute")}`;
}

const full = new Intl.DateTimeFormat("bg-BG", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Same format as the article page on the public site. */
export function formatFull(value: Date | string): string {
  return full.format(new Date(value));
}

export function formatClock(value: Date | string): string {
  return time.format(new Date(value));
}
