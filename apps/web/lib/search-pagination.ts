import { Buffer } from "node:buffer";
import { z } from "zod";
import { archiveTimestampSchema } from "./category-pagination";
import { PUBLIC_MENU } from "./menu";
import { filteredSearchUrl, normalizeSearchQuery, SEARCH_PERIODS, type SearchFilters } from "./search";

export type SearchParams = { q?: string | string[]; category?: string | string[]; period?: string | string[]; cursor?: string | string[] };
export function parseSearchFilters(params: SearchParams): SearchFilters {
  const query = normalizeSearchQuery((Array.isArray(params.q) ? params.q[0] : params.q) ?? "");
  const category = params.category ?? "";
  const period = params.period ?? "all";
  if (typeof category !== "string" || (category !== "" && !PUBLIC_MENU.some(item => item.slug === category)) ||
      typeof period !== "string" || !SEARCH_PERIODS.some(item => item.value === period)) throw new Error("Invalid search filters");
  return { query, category, period: period as SearchFilters["period"] };
}
const schema = z.object({
  v: z.literal(1), query: z.string().max(80), category: z.string().max(80),
  period: z.enum(["all", "24h", "7d", "30d"]), anchor: archiveTimestampSchema,
  direction: z.enum(["older", "newer"]),
  boundary: z.object({ at: archiveTimestampSchema, id: z.uuid() }).strict(),
}).strict();
export type SearchCursor = z.infer<typeof schema>;

export function parseSearchCursor(raw: SearchParams["cursor"], filters: SearchFilters, now = Date.now()): SearchCursor | null {
  if (raw === undefined) return null;
  if (typeof raw !== "string" || raw.length > 960 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error("Invalid search cursor");
  try {
    const cursor = schema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    if (cursor.query !== filters.query || cursor.category !== filters.category || cursor.period !== filters.period ||
        Date.parse(cursor.anchor) > now + 60_000 || cursor.boundary.at > cursor.anchor) throw new Error();
    return cursor;
  } catch { throw new Error("Invalid search cursor"); }
}

export function searchCursorUrl(cursor: SearchCursor): string {
  return `${filteredSearchUrl(cursor)}&cursor=${Buffer.from(JSON.stringify(schema.parse(cursor))).toString("base64url")}`;
}
