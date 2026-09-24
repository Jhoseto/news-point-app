export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 80;
export const SEARCH_PAGE = "/search/";

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
