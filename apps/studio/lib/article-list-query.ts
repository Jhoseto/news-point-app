export const ARTICLE_SORTS = ["updated", "published", "title", "author"] as const;
export const ARTICLE_STATUSES = ["all", "published", "draft", "changed"] as const;
export const ARTICLE_SOURCES = ["all", "wordpress", "studio"] as const;
export const ARTICLE_HERO = ["all", "with", "without"] as const;
export const DATE_FIELDS = ["updated", "published"] as const;
export const PAGE_SIZES = [25, 50, 100] as const;

export type ArticleSort = (typeof ARTICLE_SORTS)[number];
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];
export type ArticleSource = (typeof ARTICLE_SOURCES)[number];
export type ArticleHero = (typeof ARTICLE_HERO)[number];
export type DateField = (typeof DATE_FIELDS)[number];
export type PageSize = (typeof PAGE_SIZES)[number];

export type ArticleListQuery = {
  q: string;
  author: string;
  status: ArticleStatus;
  source: ArticleSource;
  hero: ArticleHero;
  category: string;
  sort: ArticleSort;
  dir: "asc" | "desc";
  dateField: DateField;
  from: string;
  to: string;
  page: number;
  pageSize: PageSize;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function one(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function day(value: string): string {
  return DAY.test(value) ? value : "";
}

export function parseArticleListQuery(params: Record<string, string | string[] | undefined>): ArticleListQuery {
  const sort = pick(one(params.sort), ARTICLE_SORTS, "updated");
  const explicitDir = one(params.dir);
  const dir = explicitDir === "asc" || explicitDir === "desc" ? explicitDir : sort === "title" || sort === "author" ? "asc" : "desc";
  const page = Math.min(100_000, Math.max(1, Number.parseInt(one(params.page), 10) || 1));
  const size = Number.parseInt(one(params.size), 10);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : 50;
  const category = one(params.category);
  let from = day(one(params.from));
  let to = day(one(params.to));
  if (from && to && from > to) [from, to] = [to, from];
  return {
    q: one(params.q).slice(0, 120),
    author: one(params.author).slice(0, 80),
    status: pick(one(params.status), ARTICLE_STATUSES, "all"),
    source: pick(one(params.source), ARTICLE_SOURCES, "all"),
    hero: pick(one(params.hero), ARTICLE_HERO, "all"),
    category: UUID.test(category) ? category : "",
    sort,
    dir,
    dateField: pick(one(params.date), DATE_FIELDS, "updated"),
    from,
    to,
    page,
    pageSize,
  };
}

export function articleListActive(query: ArticleListQuery): boolean {
  return Boolean(query.q || query.author || query.status !== "all" || query.source !== "all" || query.hero !== "all" || query.category || query.from || query.to || query.sort !== "updated" || query.dir !== "desc" || query.dateField !== "updated" || query.pageSize !== 50);
}

export function articleListHref(query: ArticleListQuery, patch: Partial<ArticleListQuery> = {}): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.author) params.set("author", next.author);
  if (next.status !== "all") params.set("status", next.status);
  if (next.source !== "all") params.set("source", next.source);
  if (next.hero !== "all") params.set("hero", next.hero);
  if (next.category) params.set("category", next.category);
  if (next.sort !== "updated") params.set("sort", next.sort);
  if (next.dir !== "desc") params.set("dir", next.dir);
  if (next.dateField !== "updated") params.set("date", next.dateField);
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.pageSize !== 50) params.set("size", String(next.pageSize));
  if (next.page > 1) params.set("page", String(next.page));
  const text = params.toString();
  return text ? `/?${text}` : "/";
}

/** LIKE pattern with `%`, `_` and `\` escaped. Empty input returns null. */
export function likePattern(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `%${trimmed.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export function sofiaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function shiftIsoDate(isoDate: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function sofiaClock(instant: Date): { day: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: get("hour"), minute: get("minute") };
}

/** Midnight at the start of a Sofia calendar day, or null when the date is not real. */
export function sofiaDayStart(isoDate: string): Date | null {
  if (!DAY.test(isoDate)) return null;
  for (const offset of ["+02:00", "+03:00"]) {
    const instant = new Date(`${isoDate}T00:00:00${offset}`);
    if (Number.isNaN(instant.getTime())) continue;
    const clock = sofiaClock(instant);
    if (clock.day === isoDate && (clock.hour === "00" || clock.hour === "24") && clock.minute === "00") return instant;
  }
  return null;
}

export function pageWindow(page: number, pageCount: number): Array<number | "gap"> {
  const wanted = [1, pageCount, page - 2, page - 1, page, page + 1, page + 2].filter((item) => item >= 1 && item <= pageCount);
  const unique = [...new Set(wanted)].sort((a, b) => a - b);
  const window: Array<number | "gap"> = [];
  for (const item of unique) {
    const previous = window.at(-1);
    if (typeof previous === "number" && item - previous > 1) window.push("gap");
    window.push(item);
  }
  return window;
}
