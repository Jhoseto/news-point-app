import { isIP } from "node:net";

/** Server-only deployment policy. Preview/local builds fail closed even with an accidental opt-in. */
export function publicIndexingEnabled(env = process.env) {
  if (env.NP_PUBLIC_INDEXING !== "1" || env.NODE_ENV !== "production") return false;
  try {
    const url = new URL(env.WEB_URL ?? "");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && !url.search && !url.hash && /^\/*$/.test(url.pathname)
      && host.includes(".") && !isIP(host)
      && !/(?:^|\.)(?:localhost|local|test|invalid|trycloudflare\.com|scloudsite\d+\.com)$/i.test(host);
  } catch { return false; }
}

export function publicRobotsMetadata(env = process.env) {
  const enabled = publicIndexingEnabled(env);
  return { index: enabled, follow: enabled, "max-image-preview": "large" };
}

/** Explicit exclusions win after the public catch-all. Studio also keeps its own noindex headers. */
export function indexingHeaderRules(env = process.env) {
  const rules = [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: publicIndexingEnabled(env) ? "index, follow" : "noindex, nofollow" }] }];
  for (const source of ["/admin/:path*", "/api/:path*", "/draft/:path*", "/settings/:path*", "/search/:path*", "/offline/:path*", "/:category/archive/:cursor/"]) {
    rules.push({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] });
  }
  return rules;
}
