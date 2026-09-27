import { normalizeSearchQuery, searchTerms } from "./search";

export const RECENT_SEARCH_KEY = "np-recent-searches-v1";
export const RECENT_SEARCH_LIMIT = 8;
export const RECENT_SEARCH_TTL = 30 * 86_400_000;
export interface RecentSearch { query: string; at: number }

export function readRecentSearches(storage: Pick<Storage, "getItem">, now = Date.now()): RecentSearch[] {
  const raw = storage.getItem(RECENT_SEARCH_KEY);
  if (!raw || raw.length > 4096) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  return parsed.flatMap((item: unknown): RecentSearch[] => {
    if (!item || typeof item !== "object" || !("query" in item) || !("at" in item) ||
        typeof item.query !== "string" || item.query.length > 80 || typeof item.at !== "number" ||
        !Number.isFinite(item.at) || item.at < now - RECENT_SEARCH_TTL || item.at > now + 60_000) return [];
    const query = normalizeSearchQuery(item.query);
    const key = query.toLocaleLowerCase("bg-BG");
    if (!searchTerms(query).length || seen.has(key)) return [];
    seen.add(key);
    return [{ query, at: item.at }];
  }).slice(0, RECENT_SEARCH_LIMIT);
}

export function addRecentSearch(items: RecentSearch[], input: string, now = Date.now()): RecentSearch[] {
  const query = normalizeSearchQuery(input);
  if (!searchTerms(query).length) return items;
  const key = query.toLocaleLowerCase("bg-BG");
  return [{ query, at: now }, ...items.filter(item => item.query.toLocaleLowerCase("bg-BG") !== key)]
    .slice(0, RECENT_SEARCH_LIMIT);
}
