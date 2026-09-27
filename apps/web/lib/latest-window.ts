export const LATEST_WINDOW_MS = 24 * 60 * 60 * 1000;

export function inLatestWindow<T extends { publishedAt: Date }>(articles: T[], nowMs: number): T[] {
  const cutoff = nowMs - LATEST_WINDOW_MS;
  return articles.filter((article) => {
    const publishedMs = article.publishedAt.getTime();
    return publishedMs > cutoff && publishedMs <= nowMs;
  });
}

/** Delay until the next visible article reaches 24 hours old. */
export function nextLatestExpiryMs(articles: { publishedAt: Date }[], nowMs: number): number | null {
  let next = Infinity;
  for (const article of articles) {
    const expiresAt = article.publishedAt.getTime() + LATEST_WINDOW_MS;
    if (expiresAt > nowMs && expiresAt < next) next = expiresAt;
  }
  return Number.isFinite(next) ? Math.max(1, next - nowMs + 20) : null;
}
