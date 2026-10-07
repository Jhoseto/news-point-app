/** Cache/JSON can turn timestamps into strings; formatters need a Date. */
export function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const sofiaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia" });

function utcDay(date: Date): number {
  const [year, month, day] = sofiaDay.format(date).split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

/** Whole calendar days in Europe/Sofia between two article timestamps. */
export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000);
}

/** Honest distance on the editorial route. Same-day hops stay quiet. */
export function transitLabel(days: number): string | null {
  if (days === 0) return null;
  const abs = Math.abs(days);
  const unit = abs === 1 ? "ден" : "дни";
  return days > 0 ? `${abs} ${unit} по-късно` : `${abs} ${unit} по-рано`;
}

export function articleCountLabel(count: number): string {
  if (count === 1) return "1 новина";
  return `${count} новини`;
}

/** Previous/next stops on a theme, in editorial position order. */
export function themeChronologyNeighbours<T extends { articleId: string; position: number }>(
  articles: T[],
  currentArticleId: string,
): { previous: T | null; next: T | null; index: number } {
  const sorted = [...articles].sort((a, b) => a.position - b.position);
  const index = sorted.findIndex((article) => article.articleId === currentArticleId);
  if (index < 0) return { previous: null, next: null, index: -1 };
  return {
    previous: sorted[index - 1] ?? null,
    next: sorted[index + 1] ?? null,
    index,
  };
}
