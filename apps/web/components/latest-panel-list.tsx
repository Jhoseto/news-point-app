"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CategoryPill, TimeMeta } from "./ui";
import { isRecentArticle, formatClock } from "@/lib/format";

type Article = {
  id: string;
  path: string;
  title: string;
  hero: { url: string; alt: string } | null;
  category: { id: string; name: string; path: string; slug: string } | null;
  publishedAt: string;
};

type Payload = { articles: Article[] };

/**
 * The list shown inside the LatestPanel. Hits /api/latest-news on first
 * mount, caches the result in component state, and revalidates in the
 * background when the panel reopens. We deliberately do not use the
 * LatestNews24h server component because the panel is rendered from
 * a client-only boundary; doing the fetch here keeps the data path
 * lazy.
 */
export function LiveNewsList({ onArticleTap }: { onArticleTap?: () => void }) {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/latest-news", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as Payload;
      setArticles(payload.articles);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Грешка при зареждане.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="np-latest-panel-error" role="status">
        <p className="text-sm font-semibold text-ink">Последните новини не могат да се заредят.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="np-latest-panel-retry"
        >
          Опитай отново
        </button>
      </div>
    );
  }

  if (!articles) {
    return (
      <div role="status" aria-live="polite" className="np-latest-panel-loading">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="np-latest-panel-skeleton" />
        ))}
      </div>
    );
  }

  return (
    <ol className="np-latest-panel-list" aria-label="Публикации от последните 24 часа">
      {articles.map((article) => {
        const linkProps = onArticleTap
          ? { onClick: onArticleTap }
          : {};
        return (
          <li key={article.id} className="np-latest-panel-item">
            <Link
              {...linkProps}
              href={article.path}
              prefetch={false}
              className="np-latest-panel-link"
            >
              <time dateTime={article.publishedAt} className="np-latest-panel-time">
                {formatClock(new Date(article.publishedAt))}
              </time>
              {article.category ? (
                <CategoryPill category={article.category} className="np-latest-panel-cat" />
              ) : null}
              {article.hero ? (
                <img
                  src={article.hero.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="np-latest-panel-thumb"
                />
              ) : null}
              <h3 className="np-latest-panel-headline">{article.title}</h3>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}