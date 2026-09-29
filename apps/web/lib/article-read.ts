export const ARTICLE_READ_MINIMUM_MS = 8_000;
export const ARTICLE_READ_MINIMUM_PROGRESS = 0.35;

export function isEngagedArticleRead(elapsedMs: number, progress: number) {
  return elapsedMs >= ARTICLE_READ_MINIMUM_MS && progress >= ARTICLE_READ_MINIMUM_PROGRESS;
}

const readsInFlight = new Map<string, Promise<number | null>>();

/** One network count per open. React's dev remount shares the same request instead of adding a second view. */
export function shareArticleRead(articleId: string, send: () => Promise<number | null>): Promise<number | null> {
  const current = readsInFlight.get(articleId);
  if (current) return current;
  const pending = send().finally(() => {
    if (readsInFlight.get(articleId) === pending) readsInFlight.delete(articleId);
  });
  readsInFlight.set(articleId, pending);
  return pending;
}

function headerToken(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

/** Accepts the browser host, not Next's internal origin. localhost and 127.0.0.1 must both count. */
export function isArticleReadSameOrigin(headers: {
  origin: string | null;
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
  fetchSite: string | null;
}): boolean {
  if (headers.fetchSite === "cross-site" || !headers.origin) return false;
  let sent: URL;
  try {
    sent = new URL(headers.origin);
  } catch {
    return false;
  }
  if ((sent.protocol !== "http:" && sent.protocol !== "https:") || sent.username || sent.password) return false;
  const hosts = [headers.host, headers.forwardedHost].map(headerToken).filter((value) => value.length > 0);
  if (!hosts.includes(sent.host)) return false;
  const proto = headerToken(headers.forwardedProto);
  return !proto || sent.protocol === `${proto}:`;
}
