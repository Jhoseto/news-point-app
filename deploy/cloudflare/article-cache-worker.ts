import { articleDocumentCandidate, articleEdgePath } from "../../packages/content/src/article-edge-cache";

type Bindings = { ENABLED?: string; PUBLIC_ORIGIN?: string };
type EdgeFetchOptions = RequestInit & { cf: { cacheEverything: boolean; cacheTtlByStatus: Record<string, number> } };
type Fetcher = (input: Request, init?: EdgeFetchOptions) => Promise<Response>;

/** Native fetch cache, not custom Cache API keys: supports global URL purge. */
export function createArticleCacheWorker(fetcher: Fetcher = fetch) {
  return {
    async fetch(request: Request, env: Bindings): Promise<Response> {
      let origin: string;
      try {
        const configured = new URL(env.PUBLIC_ORIGIN ?? "");
        if (env.ENABLED !== "1" || configured.protocol !== "https:" || configured.username || configured.password
          || configured.pathname !== "/" || configured.search || configured.hash || configured.port) return fetcher(request);
        origin = configured.origin;
      } catch { return fetcher(request); }
      const candidate = articleDocumentCandidate(request,origin);
      if (!candidate) return fetcher(request);
      const endpoint = articleEdgePath(candidate.path,candidate.viewport)!;
      try {
        // No caller cookies, authorization, RSC or forwarded routing headers.
        const fill = new Request(new URL(endpoint,origin), { method: "GET", redirect: "manual",
          headers: { accept: "text/html", "user-agent": request.headers.get("user-agent") ?? "Mozilla/5.0" },
          signal: AbortSignal.timeout(10_000) });
        const response = await fetcher(fill,{ cf: { cacheEverything: true,
          // Successful fills use the origin's public s-maxage. Never override
          // private/no-store or cache an error/redirect with a forced 200 TTL.
          cacheTtlByStatus: { "201-599": -1 } } });
        if (response.status === 200 && response.headers.get("x-np-article-cache-eligible") === "v1"
          && /^text\/html\b/i.test(response.headers.get("content-type") ?? "") && !response.headers.has("set-cookie")) {
          const headers = new Headers(response.headers);
          headers.set("x-np-article-cache",response.headers.get("cf-cache-status") ?? "ORIGIN");
          headers.delete("x-np-article-cache-eligible");
          headers.delete("x-robots-tag"); // Only the internal render URL is noindex.
          headers.delete("cache-tag");
          headers.set("cache-control","private, no-store");
          headers.set("vary","Cookie, Sec-CH-UA-Mobile, Sec-CH-Viewport-Width, User-Agent");
          return new Response(response.body,{status:200,headers});
        }
        await response.body?.cancel();
      } catch { /* A cache/configuration failure must preserve the original site. */ }
      return fetcher(request);
    },
  };
}

export default createArticleCacheWorker();
