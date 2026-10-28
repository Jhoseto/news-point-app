/** Server configuration only. The ownership key is intentionally served by the proof route. */
export type IndexNowConfig = { origin: string; key: string; keyLocation: string };

export function readIndexNowConfig(env: Record<string, string | undefined> = process.env): IndexNowConfig | null {
  if (env.NP_INDEXNOW_ENABLED !== "1") return null;
  const key = env.INDEXNOW_KEY?.trim() ?? "";
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) return null;
  try {
    const url = new URL(env.INDEXNOW_ORIGIN ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || url.pathname !== "/" || url.search || url.hash || !url.hostname.includes(".")
      || url.hostname.endsWith(".localhost") || /^[\d.]+$/.test(url.hostname)) return null;
    return { origin: url.origin, key, keyLocation: `${url.origin}/indexnow-key.txt` };
  } catch { return null; }
}

/** Only root-level canonical article URLs; never private routes or external URLs. */
export function indexNowArticleUrl(path: string, origin: string): string | null {
  try { path = decodeURIComponent(path); } catch { return null; }
  if (!/^\/[\p{L}\p{N}_-]+\/$/u.test(path) || path.length > 1800) return null;
  const slug = path.slice(1, -1).toLowerCase();
  if (["admin", "api", "draft", "settings", "search", "preview", "login"].includes(slug)
    || slug.startsWith("qa-editor-")) return null;
  return new URL(path, origin).href;
}

export function indexNowRetryMs(attempt: number, retryAfter: string | null, now = Date.now()): number {
  const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : NaN;
  const dateDelay = retryAfter ? Date.parse(retryAfter) - now : NaN;
  const requested = Number.isFinite(seconds) ? seconds : Number.isFinite(dateDelay) ? dateDelay : 0;
  return Math.min(86400_000, Math.max(60_000 * 2 ** Math.min(attempt - 1, 10), requested));
}
