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

const full = new Intl.DateTimeFormat("bg-BG", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Same format as the article page on the public site. */
export function formatFull(value: Date | string): string {
  return full.format(new Date(value));
}

export function formatClock(value: Date | string): string {
  return time.format(new Date(value));
}
