export const LATEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Last 24 hours, newest on the left. Later copies of the same story are dropped. */
export function chronologicalLatest<T extends { id: string; publishedAt: Date }>(articles: T[], nowMs: number, cap = Number.POSITIVE_INFINITY): T[] {
  const seen = new Set<string>();
  const ordered = inLatestWindow(articles, nowMs).filter((article) => {
    if (seen.has(article.id)) return false;
    seen.add(article.id);
    return true;
  }).sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime() || left.id.localeCompare(right.id));
  return ordered.length > cap ? ordered.slice(0, cap) : ordered;
}

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
