export type ArticleAnalyticsMeta = {
  article_id: string;
  article_category: string;
  article_author: string;
  content_kind: "article" | "article_with_embed";
};
export type ArticleAnalyticsEvent = "np_article_view" | "np_article_depth" | "np_article_next";
export type ArticleAnalyticsParams = ArticleAnalyticsMeta & { percent_scrolled?: number; destination_article_id?: string };
type Sample = { now: number; visible: boolean; body: { top: number; bottom: number; height: number } | null; viewportHeight: number };

/** Position reached in the article body, not proof that its text was read. */
export function articleDepth(body: Sample["body"], viewportHeight: number): number {
  if (!body || !Number.isFinite(body.height) || body.height <= 0 || viewportHeight <= 0) return 0;
  return Math.max(0, Math.min(100, (viewportHeight - body.top) / body.height * 100));
}

/** No storage, user identifiers, titles, URLs or query strings. One instance per article visit. */
export function createArticleMeasurement(meta: ArticleAnalyticsMeta, enabled: () => boolean,
  send: (event: ArticleAnalyticsEvent, params: ArticleAnalyticsParams) => boolean) {
  let viewed = false, activeMs = 0, lastAt: number | null = null, wasReading = false;
  const depths = new Set<number>(), destinations = new Set<string>();
  return {
    sample({ now, visible, body, viewportHeight }: Sample) {
      const allowed = enabled();
      const reading = allowed && visible && !!body && body.top < viewportHeight && body.bottom > 0;
      // A suspended timer or a hidden tab must not inflate foreground time.
      if (reading && wasReading && lastAt !== null) activeMs += Math.max(0, Math.min(1500, now - lastAt));
      lastAt = now; wasReading = reading;
      if (!allowed || !visible) return;
      if (!viewed) viewed = send("np_article_view", meta);
      if (!viewed || !reading || activeMs < 5000) return;
      for (const threshold of [50, 90]) if (!depths.has(threshold) && articleDepth(body, viewportHeight) >= threshold) {
        if (send("np_article_depth", { ...meta, percent_scrolled: threshold })) depths.add(threshold);
      }
    },
    next(destinationId: string, visible: boolean) {
      if (!visible || !enabled() || destinationId === meta.article_id || destinations.has(destinationId)) return;
      if (send("np_article_next", { ...meta, destination_article_id: destinationId })) destinations.add(destinationId);
    },
  };
}

/** Only explicitly rendered public article links qualify; never transmit the href itself. */
export function nextArticleId(href: string, origin: string, currentPath: string, targets: ReadonlyMap<string, string>): string | null {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || url.pathname === currentPath) return null;
    return targets.get(url.pathname) ?? null;
  } catch { return null; }
}
