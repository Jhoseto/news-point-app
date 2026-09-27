export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 80;
export const SEARCH_PAGE = "/search/";

export function normalizeSearchQuery(query: string): string {
  return query.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, SEARCH_MAX_LENGTH);
}

export const SEARCH_PERIODS = [
  { value: "all", label: "Всички", ms: 0 },
  { value: "24h", label: "24 часа", ms: 86_400_000 },
  { value: "7d", label: "7 дни", ms: 7 * 86_400_000 },
  { value: "30d", label: "30 дни", ms: 30 * 86_400_000 },
] as const;
export type SearchPeriod = (typeof SEARCH_PERIODS)[number]["value"];
export interface SearchFilters { query: string; category: string; period: SearchPeriod }

/** Always resets pagination when a query/filter changes. */
export function filteredSearchUrl({ query, category, period }: SearchFilters): string {
  const params = new URLSearchParams({ q: normalizeSearchQuery(query) });
  if (category) params.set("category", category);
  if (period !== "all") params.set("period", period);
  return `${SEARCH_PAGE}?${params}`;
}

/** One result of /api/search, safe to send to the browser. */
export interface SearchHit {
  id: string;
  path: string;
  title: string;
  category: string | null;
  image: string | null;
  publishedAt: string;
}

/** Words of the query; each must appear in the title or the excerpt. */
export function searchTerms(query: string): string[] {
  return query
    .normalize("NFC")
    .slice(0, SEARCH_MAX_LENGTH)
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{Nd}-]/gu, ""))
    .filter((term) => term.length >= SEARCH_MIN_LENGTH)
    .slice(0, 6);
}

export function searchPageUrl(query: string): string {
  return `${SEARCH_PAGE}?q=${encodeURIComponent(query.trim())}`;
}
