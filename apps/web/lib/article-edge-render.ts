import "server-only";
import { ARTICLE_EDGE_TTL, hasArticleEdgeMarker, type ArticleViewport } from "../../../packages/content/src/article-edge-cache";
import { publicIndexingEnabled } from "./indexing-policy.mjs";

export const MAX_ARTICLE_HTML_BYTES = 2 * 1024 * 1024;
export type ArticleEdgeConfig = { publicOrigin: string; internalOrigin: string; zoneId: string; token: string };

export function articleEdgeConfig(env: Record<string, string | undefined> = process.env): ArticleEdgeConfig | null {
  if (env.NP_ARTICLE_EDGE_CACHE !== "1" || !publicIndexingEnabled(env)) return null;
  try {
    const internal = new URL(env.REVALIDATE_INTERNAL_URL ?? "");
    if (!/^https?:$/.test(internal.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(internal.hostname)
      || internal.username || internal.password || internal.search || internal.hash || internal.pathname !== "/") return null;
    const zoneId = env.CLOUDFLARE_CACHE_ZONE_ID ?? "", token = env.CLOUDFLARE_CACHE_PURGE_TOKEN ?? "";
    if (!/^[a-f0-9]{32}$/i.test(zoneId) || !token.trim()) return null;
    return { publicOrigin: new URL(env.WEB_URL!).origin, internalOrigin: internal.origin, zoneId, token };
  } catch { return null; }
}

type Render = { body: Uint8Array; contentType: string };
type Flight = { path: string; invalidated: boolean; promise: Promise<Render> };

/** Coalesce origin fills across edge locations; never retain HTML after the fill. */
export class ArticleHtmlFlights {
  private flights = new Map<string, Flight>();
  async render(path: string, viewport: ArticleViewport, load: () => Promise<Render>): Promise<Render> {
    const key = `${viewport}:${path}`;
    const existing = this.flights.get(key);
    if (existing) return existing.promise;
    if (this.flights.size >= 24) throw new Error("Article render capacity reached");
    const flight: Flight = { path, invalidated: false, promise: Promise.resolve(null as unknown as Render) };
    flight.promise = Promise.resolve().then(load).then(result => {
      if (flight.invalidated) throw new Error("Article changed during render");
      return result;
    }).finally(() => { if (this.flights.get(key) === flight) this.flights.delete(key); });
    this.flights.set(key, flight);
    return flight.promise;
  }
  invalidate(paths: string[]) { for (const flight of this.flights.values()) if (paths.includes(flight.path)) flight.invalidated = true; }
}

const globals = globalThis as typeof globalThis & { __npArticleHtmlFlights?: ArticleHtmlFlights };
export const articleHtmlFlights = globals.__npArticleHtmlFlights ??= new ArticleHtmlFlights();

export async function renderAnonymousArticle(path: string, viewport: ArticleViewport, config: ArticleEdgeConfig): Promise<Render> {
  const response = await fetch(new URL(path, config.internalOrigin), {
    redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: {
      accept: "text/html", "accept-language": "bg-BG,bg;q=0.9", cookie: `np-viewport=${viewport}`,
      "user-agent": viewport === "desktop" ? "Mozilla/5.0 NewsPointPublicDocument/1.0" : "Mozilla/5.0 (iPhone; Mobile) NewsPointPublicDocument/1.0",
      "sec-ch-ua-mobile": viewport === "mobile" ? "?1" : "?0",
      "sec-ch-viewport-width": viewport === "mobile" ? "390" : "1280",
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== 200 || !/^text\/html\b/i.test(contentType) || response.headers.has("set-cookie")
    || /noindex/i.test(response.headers.get("x-robots-tag") ?? "") || !response.body) {
    await response.body?.cancel(); throw new Error("Article response is not eligible");
  }
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_ARTICLE_HTML_BYTES) { await reader.cancel(); throw new Error("Article HTML exceeds limit"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk,offset); offset += chunk.length; }
  const html = new TextDecoder().decode(body);
  if (!hasArticleEdgeMarker(html,path) || /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) throw new Error("Public article marker missing");
  return { body, contentType };
}

export function articleRenderHeaders(contentType: string): HeadersInit {
  return { "content-type": contentType, "cache-control": `public, max-age=0, s-maxage=${ARTICLE_EDGE_TTL}, must-revalidate`,
    "x-np-article-cache-eligible": "v1", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff" };
}
