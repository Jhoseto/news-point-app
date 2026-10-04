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
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

/** Calendar day in Europe/Sofia (`YYYY-MM-DD`). */
export function sofiaDayKey(date: Date): string {
  return dayKey.format(date);
}

export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

/** "12:34" for today, "22 септември" otherwise. */
export function formatShort(date: Date, now = new Date()): string {
  return dayKey.format(date) === dayKey.format(now) ? timeFormat.format(date) : dayFormat.format(date);
}

/** Relative age for the first 24 hours, then the usual local time/date. */
export function formatCardTime(date: Date, now = new Date()): string {
  const elapsedMs = now.getTime() - date.getTime();
  if (elapsedMs < 0 || elapsedMs >= 24 * 60 * 60 * 1000) return formatShort(date, now);
  const minutes = Math.max(1, Math.floor(elapsedMs / 60_000));
  if (minutes < 60) return `преди ${minutes} ${minutes === 1 ? "минута" : "минути"}`;
  const hours = Math.floor(minutes / 60);
  return `преди ${hours} ${hours === 1 ? "час" : "часа"}`;
}

/** A factual freshness label for articles published within the last hour. */
export function isRecentArticle(date: Date, now = new Date()): boolean {
  const elapsedMs = now.getTime() - date.getTime();
  return elapsedMs >= 0 && elapsedMs < 60 * 60 * 1000;
}

const numericDayFormat = new Intl.DateTimeFormat("bg-BG", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });

/** Heading when the timeline crosses into an earlier calendar day (Sofia). */
export function formatTimelineDayHeading(date: Date, now = new Date()): string {
  const key = sofiaDayKey(date);
  const todayKey = sofiaDayKey(now);
  if (key === todayKey) return "Днес";
  const dayDiff = Math.round((parseDayKey(todayKey).getTime() - parseDayKey(key).getTime()) / 86_400_000);
  if (dayDiff === 1) return "Вчера";
  return dayFormat.format(date);
}

export function timelineDayBreak(previous: Date | undefined, current: Date): boolean {
  if (!previous) return false;
  return sofiaDayKey(previous) !== sofiaDayKey(current);
}

/** "12:34" within the last 24 hours, "23.09" otherwise; fits a narrow timeline column. */
export function formatClock(date: Date, now = new Date()): string {
  const elapsedMs = now.getTime() - date.getTime();
  if (elapsedMs >= 0 && elapsedMs < 24 * 60 * 60 * 1000) return timeFormat.format(date);
  return numericDayFormat.format(date).replace(/\.$/, "");
}

export function formatFull(date: Date): string {
  return fullFormat.format(date);
}

const articleMetaFormat = new Intl.DateTimeFormat("bg-BG", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Compact stamp for the article meta card (mobile-friendly). */
export function formatArticleMeta(date: Date): string {
  return articleMetaFormat.format(date).replace(/\s*г\.\s*,/, ",").replace(/\.$/, "");
}

const headerDayFormat = new Intl.DateTimeFormat("bg-BG", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });

/** "Четвъртък, 24 септември" for the header. */
export function formatHeaderDay(now = new Date()): string {
  const text = headerDayFormat.format(now);
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
