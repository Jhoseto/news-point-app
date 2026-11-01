import { inspectSeoHtml } from "./html-audit";

const excludedPagePaths = /^\/(?:api|admin|draft|edge-article-cache|media|wp-content|_next|cdn-cgi|podcast-audio)(?:\/|$)/;
function publicPagePath(path: string): boolean {
  try { return !excludedPagePaths.test(decodeURIComponent(path)); }
  catch { return false; }
}

/** Exact public utilities excluded by indexing-policy or their own route metadata. */
export function intentionalNoindexPath(path: string): boolean {
  const pathname = new URL(path, "https://audit.invalid").pathname;
  return /^\/(?:settings|search|offline)(?:\/|$)/.test(pathname)
    || /^\/[^/]+\/archive\/[^/]+\/$/.test(pathname)
    || pathname === "/moyat-plovdiv/saved/";
}

/** A bounded, public same-origin GET audit; never follows links off the target site. */
export function internalLinkPaths(hrefs: string[], origin: string, pagePath = "/"): string[] {
  return [...new Set(hrefs.flatMap(href => {
    try {
      const url = new URL(href, `${origin}${pagePath}`);
      if (url.origin !== origin || url.username || url.password || !["https:", "http:"].includes(url.protocol)) return [];
      if (!publicPagePath(url.pathname)) return [];
      return [url.pathname + url.search];
    } catch { return []; }
  }))];
}

export async function auditPublicLink(path: string, base: string, origin: string, request: typeof fetch = fetch, options: { expectIndexable?: boolean } = {}) {
  const hops: { path: string; status: number }[] = [];
  const errors: string[] = [];
  let current = path;
  let canonical: string | undefined;
  let noindex = false;
  try {
    for (let step = 0; step < 6; step++) {
      const currentUrl = new URL(current, base);
      if (currentUrl.origin !== new URL(base).origin || currentUrl.username || currentUrl.password || !publicPagePath(currentUrl.pathname)) {
        errors.push("Not a public page target"); break;
      }
      if (hops.some(hop => hop.path === current)) { errors.push("Redirect loop"); break; }
      const response = await request(`${base}${current}`, { redirect: "manual", headers: { "user-agent": "NewsPoint-SEO-Audit" }, signal: AbortSignal.timeout(30000) });
      hops.push({ path: current, status: response.status });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) { errors.push("Redirect without Location"); break; }
        const next = new URL(location, `${base}${current}`);
        if (![new URL(base).origin, origin].includes(next.origin) || next.username || next.password) { errors.push("Redirect outside audited site"); break; }
        current = next.pathname + next.search;
        if (step === 5) errors.push("Redirect hop limit exceeded");
        continue;
      }
      if (response.status !== 200) errors.push(`HTTP ${response.status}`);
      if (response.headers.get("content-type")?.includes("text/html")) {
        const meta = inspectSeoHtml(await response.text());
        canonical = meta.canonicals[0];
        noindex = [...meta.robots, response.headers.get("x-robots-tag") ?? ""].some(value => /\b(?:noindex|none)\b/i.test(value));
        errors.push(...meta.errors);
        if (response.status === 200) {
          const intentionalNoindex = intentionalNoindexPath(current);
          if ((options.expectIndexable ?? true) && noindex && !intentionalNoindex) errors.push("Public page unexpectedly noindex");
          if (!(options.expectIndexable ?? true) && !noindex) errors.push("Preview page missing noindex");
          if (intentionalNoindex && !noindex) errors.push("Utility page missing noindex");
          if (!intentionalNoindex) {
            if (meta.canonicals.length !== 1) errors.push("Missing/duplicate canonical");
            else if (canonical !== `${origin}${new URL(current, base).pathname}`) errors.push("Canonical mismatch");
          }
        }
      } else await response.body?.cancel();
      break;
    }
  } catch (error) { errors.push(error instanceof Error ? error.name : "Request failed"); }
  return { path, finalPath: current, hops, canonical, noindex, errors };
}
