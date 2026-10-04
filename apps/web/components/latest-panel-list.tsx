"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ArticleSummary } from "@/lib/queries";
import { categoryAccentStyle } from "@/lib/category-accent";
import { formatClock, timelineDayBreak } from "@/lib/format";
import { inLatestWindow, nextLatestExpiryMs } from "@/lib/latest-window";
import { ArticleImage } from "./ui";
import { TimelineDayBreak } from "./timeline-day-break";

type Payload = { articles: Array<Omit<ArticleSummary, "publishedAt"> & { publishedAt: string }> };

/** Real public feed, refreshed on reopen and content updates without losing the list scroll. */
export function LiveNewsList({ active, onArticleTap }: { active: boolean; onArticleTap?: () => void }) {
  const [articles, setArticles] = useState<ArticleSummary[] | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const visible = useMemo(() => inLatestWindow(articles ?? [], nowMs), [articles, nowMs]);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/latest-news", { cache: "no-store", signal });
      if (!response.ok) throw new Error("Latest news unavailable");
      const payload = await response.json() as Payload;
      if (!Array.isArray(payload.articles)) throw new Error("Invalid latest news response");
      const next = payload.articles.flatMap((item) => {
        if (!item || typeof item.id !== "string" || typeof item.path !== "string" || typeof item.title !== "string") return [];
        const publishedAt = new Date(item.publishedAt);
        return Number.isFinite(publishedAt.getTime()) ? [{ ...item, publishedAt }] : [];
      });
      if (!signal.aborted) { setArticles(next); setNowMs(Date.now()); setError(false); }
    } catch {
      if (!signal.aborted) setError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active) return;
    let controller: AbortController;
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      setNowMs(Date.now());
      void load(controller.signal);
    };
    const whenVisible = () => { if (!document.hidden) refresh(); };
    refresh();
    window.addEventListener("np:public-content-updated", refresh);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      controller?.abort();
      window.removeEventListener("np:public-content-updated", refresh);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [active, load, retry]);

  useEffect(() => {
    if (!active) return;
    const delay = nextLatestExpiryMs(visible, nowMs);
    if (delay === null) return;
    const timer = setTimeout(() => setNowMs(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [active, visible, nowMs]);

  return (
    <>
      {error ? (
        <div className="np-mobile-sheet-error" role="status">
          <p>{articles ? "Обновяването е временно недостъпно. Показваме заредените новини." : "Последните новини не могат да се заредят."}</p>
          <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)} className="np-mobile-sheet-retry">
            {loading ? "Зареждане…" : "Опитай отново"}
          </button>
        </div>
      ) : null}
      {!articles && !error ? (
        <div role="status" aria-live="polite" className="np-mobile-sheet-loading">
          <span className="sr-only">Зареждане на последните новини…</span>
          {[0, 1, 2, 3, 4, 5].map(index => <div key={index} className="np-mobile-sheet-skeleton" aria-hidden="true" />)}
        </div>
      ) : articles && !visible.length ? (
        <p className="np-mobile-sheet-empty" role="status">Няма публикувани новини през последните 24 часа.</p>
      ) : articles ? (
        <ol className="np-mobile-sheet-list" aria-label="Публикации от последните 24 часа">
          {visible.map((article, index) => (
            <Fragment key={article.id}>
              {index === 0 || timelineDayBreak(visible[index - 1]?.publishedAt, article.publishedAt) ? <TimelineDayBreak date={article.publishedAt} /> : null}
              <li className="np-mobile-sheet-item" style={categoryAccentStyle(article.category?.slug)}>
                <time dateTime={article.publishedAt.toISOString()} className="np-mobile-sheet-time">{formatClock(article.publishedAt)}</time>
                <span className="np-mobile-sheet-dot np-gradient-bg" aria-hidden="true" />
                <Link href={article.path} prefetch={false} onClick={() => onArticleTap?.()} className="np-mobile-sheet-link">
                  <div className="np-mobile-sheet-content">
                    <h3 className="np-mobile-sheet-headline">{article.title}</h3>
                    {article.category ? <span className="np-mobile-sheet-category">{article.category.name}</span> : null}
                  </div>
                  {article.hero ? <ArticleImage media={{ ...article.hero, alt: "" }} sizes="52px" className="np-mobile-sheet-thumb" /> : null}
                </Link>
              </li>
            </Fragment>
          ))}
        </ol>
      ) : null}
    </>
  );
}
