/** Public article documents only. This module is also bundled into the edge Worker. */
export const ARTICLE_EDGE_PREFIX = "/edge-article-cache/v1/";
export const ARTICLE_EDGE_TTL = 30;
export const ARTICLE_EDGE_MARKER = "np-public-article";
export type ArticleViewport = "desktop" | "mobile";

const reserved = new Set(["admin", "api", "draft", "settings", "offline", "search", "edge-article-cache", "_next", "media", "wp-content", "share", "feed", "sitemaps", "team", "livepoint"]);

export function canonicalArticleCachePath(value: string): string | null {
  if (value.length > 1024 || !value.startsWith("/") || !value.endsWith("/") || /[?#\\\s]/u.test(value)) return null;
  try {
    const parts = value.slice(1, -1).split("/").map(decodeURIComponent);
    if (!parts.length || parts.length > 8 || parts.some(p => !p || p === "." || p === ".." || !/^[\p{L}\p{N}_.~-]+$/u.test(p))) return null;
    if (reserved.has(parts[0]!.toLowerCase())) return null;
    return `/${parts.map(encodeURIComponent).join("/")}/`;
  } catch { return null; }
}

export function articleEdgePath(path: string, viewport: ArticleViewport): string | null {
  const canonical = canonicalArticleCachePath(path);
  return canonical ? `${ARTICLE_EDGE_PREFIX}${viewport}${canonical}` : null;
}

export function articleEdgeMarker(path: string): string {
  return `v1:${encodeURIComponent(canonicalArticleCachePath(path) ?? "")}`;
}

/** Matches only our generated opt-in meta, not arbitrary public/private HTML. */
export function hasArticleEdgeMarker(html: string, path: string): boolean {
  const expected = articleEdgeMarker(path);
  return [...html.matchAll(/<meta\b[^>]*>/gi)].some(([tag]) =>
    /\bname=["']np-public-article["']/i.test(tag)
    && (tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] === expected));
}

/** Same precedence as the public SSR shell; callers bypass unknown cookies. */
export function articleViewport(headers: Headers): ArticleViewport {
  const measured = headers.get("cookie")?.match(/(?:^|;\s*)np-viewport=(mobile|desktop)(?:;|$)/)?.[1];
  if (measured === "mobile" || measured === "desktop") return measured;
  const width = Number(headers.get("sec-ch-viewport-width") ?? headers.get("viewport-width"));
  if (Number.isFinite(width) && width > 0) return width >= 1024 ? "desktop" : "mobile";
  const mobile = headers.get("sec-ch-ua-mobile");
  if (mobile === "?1") return "mobile";
  if (mobile === "?0") return "desktop";
  const ua = headers.get("user-agent") ?? "";
  return /Android|iPhone|iPod|Mobile/i.test(ua) && !/iPad|Tablet/i.test(ua) ? "mobile" : "desktop";
}

const passiveCookies = new Set(["np-viewport", "__cf_bm", "cf_clearance", "_cfuvid"]);
const trackingQuery = /^(utm_(?:source|medium|campaign|term|content|id)|fbclid|gclid|dclid|msclkid)$/i;

export function articleDocumentCandidate(request: Request, publicOrigin: string): { path: string; viewport: ArticleViewport } | null {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== publicOrigin || !request.headers.get("accept")?.includes("text/html")) return null;
  if (url.search.length > 2048 || (request.headers.get("cookie")?.length ?? 0) > 8192) return null;
  for (const header of ["authorization", "range", "rsc", "next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch", "next-url", "next-action", "x-prerender-revalidate", "x-middleware-prefetch"]) {
    if (request.headers.has(header)) return null;
  }
  if (request.headers.get("cache-control")?.match(/no-cache|no-store/i)) return null;
  const ua = request.headers.get("user-agent") ?? "";
  // Crawlers retain Next's original metadata-streaming behavior.
  if (ua.length > 1024 || !/Mozilla\//i.test(ua) || /bot|spider|crawler|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|headless|lighthouse/i.test(ua)) return null;
  const seenCookies = new Set<string>();
  for (const entry of (request.headers.get("cookie") ?? "").split(";").filter(p => p.trim())) {
    const i = entry.indexOf("=");
    const name = entry.slice(0,i).trim();
    if (i < 1 || !passiveCookies.has(name) || seenCookies.has(name)) return null;
    seenCookies.add(name);
  }
  for (const key of url.searchParams.keys()) if (!trackingQuery.test(key)) return null;
  const path = canonicalArticleCachePath(url.pathname);
  return path ? { path, viewport: articleViewport(request.headers) } : null;
}
