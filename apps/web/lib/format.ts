import type { ArticleBody } from "@newspoint/content";

const TIME_ZONE = "Europe/Sofia";

const timeFormat = new Intl.DateTimeFormat("bg-BG", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("bg-BG", { timeZone: TIME_ZONE, day: "numeric", month: "long" });
const fullFormat = new Intl.DateTimeFormat("bg-BG", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const todayFormat = new Intl.DateTimeFormat("bg-BG", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

/** "12:34" for today, "22 септември" otherwise. */
export function formatShort(date: Date, now = new Date()): string {
  return dayKey.format(date) === dayKey.format(now) ? timeFormat.format(date) : dayFormat.format(date);
}

const numericDayFormat = new Intl.DateTimeFormat("bg-BG", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });

/** "12:34" for today, "23.09" otherwise; fits a narrow timeline column. */
export function formatClock(date: Date, now = new Date()): string {
  return dayKey.format(date) === dayKey.format(now) ? timeFormat.format(date) : numericDayFormat.format(date).replace(/\.$/, "");
}

export function formatFull(date: Date): string {
  return fullFormat.format(date);
}

export function formatToday(now = new Date()): string {
  const text = todayFormat.format(now);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function isoDate(date: Date): string {
  return date.toISOString();
}

const WORDS_PER_MINUTE = 200;

export function readingMinutes(body: ArticleBody): number {
  let text = "";
  for (const block of body) {
    if (block.type === "paragraph" || block.type === "quote" || block.type === "legacy_html") text += ` ${block.html}`;
    else if (block.type === "heading") text += ` ${block.text}`;
    else if (block.type === "list") text += ` ${block.items.join(" ")}`;
  }
  const words = text.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
