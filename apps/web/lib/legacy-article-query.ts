import { and, eq, sql } from "drizzle-orm";
import { articles } from "@newspoint/db/schema";

/** WordPress shortlinks identify one positive integer post ID. */
export function legacyArticleId(params: URLSearchParams): number | null {
  const values = params.getAll("p");
  if (values.length !== 1 || !/^[1-9]\d{0,15}$/.test(values[0]!)) return null;
  const id = Number(values[0]);
  return Number.isSafeInteger(id) ? id : null;
}

/** Keep this lookup restricted to published imports, including on direct API calls. */
export function legacyArticleFilter(id: number) {
  return and(eq(articles.sourceSystem, "wordpress"), eq(articles.legacyId, id),
    eq(articles.isPublic, true), sql`${articles.publishedAt} <= now()`);
}

export function legacyArticleDestination(path: string, params: URLSearchParams): string | null {
  // A corrupted stored path must not become an open redirect or point at the homepage.
  if (!/^\/(?!\/)[^?#\\\s]+\/$/.test(path)) return null;
  let encodedPath: string;
  try {
    const url = new URL(path, "https://newspoint.bg");
    encodedPath = url.pathname;
    if (url.origin !== "https://newspoint.bg" || (encodedPath !== path && encodedPath !== encodeURI(path))) return null;
  } catch { return null; }
  const query = new URLSearchParams(params);
  query.delete("p");
  return `${encodedPath}${query.size ? `?${query}` : ""}`;
}
