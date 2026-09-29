"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { ArticleSummary } from "@/lib/queries";
import { categoryAccentStyle } from "@/lib/category-accent";
import { formatCardTime, formatClock, isoDate, timelineDayBreak } from "@/lib/format";
import { TimelineDayBreak } from "./timeline-day-break";
import { inLatestWindow, nextLatestExpiryMs } from "@/lib/latest-window";
import { ArticleImage, CategoryLabel, CategoryPill, SectionTitle } from "./ui";

type ActivePreview = {
  id: string;
  anchorY: number;
  left: number;
  top: number;
  height: number;
  width: number;
  backdropLeft: number;
  backdropWidth: number;
};

function NewsPreview({ article, position }: { article: ArticleSummary; position: ActivePreview }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="np-latest-backdrop pointer-events-none absolute inset-y-0 z-20 hidden lg:block"
        style={{ left: position.backdropLeft, width: position.backdropWidth }}
      />
      <span
        aria-hidden="true"
        className="np-latest-connector pointer-events-none absolute right-full z-30 hidden lg:block"
        style={{ top: position.anchorY, width: -position.left - position.width, ...categoryAccentStyle(article.category?.slug) }}
      />
      <aside
        aria-hidden="true"
        className="np-latest-preview-shell pointer-events-none absolute z-30 hidden lg:block"
        style={{ left: position.left, top: position.top, width: position.width, height: position.height, ...categoryAccentStyle(article.category?.slug) }}
      >
        <div key={article.id} className="np-latest-preview relative flex h-full flex-col overflow-hidden rounded-[1.4rem] border border-line bg-surface">
          <span className="np-category-accent-line absolute inset-x-6 top-0 z-10 h-0.5" />
          <div className="relative h-[42%] shrink-0 overflow-hidden">
            {article.hero ? (
              <ArticleImage media={article.hero} sizes="384px" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-surface-2"><span className="np-ring scale-[2]" /></div>
            )}
            {article.category ? <CategoryPill category={article.category} glass={false} className="absolute top-4 left-4" /> : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-4 xl:p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              {article.category ? <CategoryLabel category={article.category} /> : <span />}
              <time dateTime={isoDate(article.publishedAt)} className="shrink-0 text-xs font-semibold text-muted">{formatCardTime(article.publishedAt)}</time>
            </div>
            <h3 className="line-clamp-3 text-base leading-snug font-extrabold tracking-tight text-ink xl:text-lg">{article.title}</h3>
            {article.excerpt ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted xl:line-clamp-3">{article.excerpt}</p> : null}
            <div className="mt-auto border-t border-line pt-3">
              <span className="block truncate text-xs font-semibold text-muted">{article.authorName}</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

/** All published articles from a rolling day. Only the hovered preview mounts an image. */
export function LatestNews24h({
  articles,
  asOfMs,
  dense = false,
  liveRefresh = false,
  className = "",
}: {
  articles: ArticleSummary[];
  asOfMs: number;
  dense?: boolean;
  liveRefresh?: boolean;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(asOfMs);
  const [feed, setFeed] = useState(articles);
  const [active, setActive] = useState<ActivePreview | null>(null);
  const sectionId = dense ? "posledni-desktop" : "posledni";
  const visible = useMemo(() => inLatestWindow(feed, nowMs), [feed, nowMs]);
  const activeArticle = visible.find((article) => article.id === active?.id);

  useEffect(() => setNowMs(Date.now()), [asOfMs]);
  useEffect(() => setFeed(articles), [articles]);

  useEffect(() => {
    if (!liveRefresh) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const sync = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/latest-news", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json() as { articles?: Array<Omit<ArticleSummary, "publishedAt"> & { publishedAt: string }> };
        if (!Array.isArray(payload.articles)) return;
        const next = payload.articles.flatMap((item) => {
          if (typeof item.id !== "string" || typeof item.path !== "string" || typeof item.title !== "string") return [];
          const publishedAt = new Date(item.publishedAt);
          return Number.isFinite(publishedAt.getTime()) ? [{ ...item, publishedAt }] : [];
        });
        setFeed(next);
        setNowMs(Date.now());
        setActive(null);
      } catch { /* Keep the last valid public feed when temporarily offline. */ }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void sync(); }, 500);
    };
    const whenVisible = () => { if (!document.hidden) schedule(); };
    window.addEventListener("np:public-content-updated", schedule);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      if (timer) clearTimeout(timer);
      controller?.abort();
      window.removeEventListener("np:public-content-updated", schedule);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [liveRefresh]);

  useEffect(() => {
    const delay = nextLatestExpiryMs(visible, nowMs);
    const timer = delay === null ? undefined : setTimeout(() => setNowMs(Date.now()), delay);
    const syncWhenVisible = () => {
      if (!document.hidden) setNowMs(Date.now());
    };
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [visible, nowMs]);

  useEffect(() => {
    const clear = () => setActive(null);
    window.addEventListener("resize", clear);
    return () => window.removeEventListener("resize", clear);
  }, []);

  const activate = (id: string, link: HTMLElement) => {
    if (!dense || !window.matchMedia("(min-width: 1024px)").matches) return;
    const section = link.closest("section");
    const support = section?.previousElementSibling;
    if (!section || !(support instanceof HTMLElement)) return;
    const sectionRect = section.getBoundingClientRect();
    const supportRect = support.getBoundingClientRect();
    // The middle column gets too narrow near the lg breakpoint; a flyout there would cover the lead headline.
    if (supportRect.width < 220) {
      setActive(null);
      return;
    }
    const linkRect = link.getBoundingClientRect();
    const anchorY = Math.max(24, Math.min(sectionRect.height - 24, linkRect.top + linkRect.height / 2 - sectionRect.top));
    // The home preview is naturally compact because its panel lives in the
    // shallow lead band. Viewport-height panels must keep that same card scale
    // instead of stretching the preview to the full article/category rail.
    const height = Math.min(sectionRect.height, window.innerHeight * 0.56, 544);
    const top = Math.max(0, Math.min(sectionRect.height - height, anchorY - height / 2));
    const width = Math.min(320, Math.max(240, Math.min(supportRect.width - 24, sectionRect.width * 0.78)));
    const gap = 12;
    setActive({
      id,
      anchorY,
      left: -width - gap,
      top,
      height,
      width,
      backdropLeft: supportRect.left - sectionRect.left,
      backdropWidth: supportRect.width,
    });
  };

  return (
    <section
      aria-labelledby={`${sectionId}-title`}
      id={sectionId}
      className={`np-card np-latest-panel z-20 flex min-h-0 flex-col overflow-visible scroll-mt-32 ${dense ? "p-4" : "p-5"} ${className}`}
      onMouseLeave={() => setActive(null)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActive(null);
      }}
    >
      <SectionTitle id={`${sectionId}-title`}>Последни новини</SectionTitle>
      <p className="mb-3 flex items-center justify-between gap-2 text-[0.6875rem] font-semibold tracking-wide text-muted uppercase">
        <span>Последните 24 часа</span>
        <span className="tabular-nums">{visible.length} {visible.length === 1 ? "новина" : "новини"}</span>
      </p>
      {visible.length ? (
        <ol
          aria-label="Публикации от последните 24 часа"
          className={`np-scroll-soft relative -mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2 before:pointer-events-none before:absolute before:top-2 before:bottom-2 before:left-[3.25rem] before:w-px before:bg-line ${dense ? "gap-2.5" : "gap-4"}`}
          onScroll={(event) => {
            const focused = event.currentTarget.querySelector<HTMLAnchorElement>("a:focus[data-latest-id]");
            if (focused) {
              const listRect = event.currentTarget.getBoundingClientRect();
              const linkRect = focused.getBoundingClientRect();
              if (linkRect.bottom > listRect.top && linkRect.top < listRect.bottom) {
                activate(focused.dataset.latestId!, focused);
                return;
              }
            }
            setActive(null);
          }}
        >
          {visible.map((article, index) => (
            <Fragment key={article.id}>
              {timelineDayBreak(visible[index - 1]?.publishedAt, article.publishedAt) ? (
                <TimelineDayBreak date={article.publishedAt} />
              ) : null}
              <li className={`group relative pl-16 pr-1 ${active?.id === article.id ? "np-latest-row-active" : ""}`} style={categoryAccentStyle(article.category?.slug)}>
              <time dateTime={isoDate(article.publishedAt)} className="absolute top-0.5 left-0 text-xs font-bold text-muted tabular-nums">
                {formatClock(article.publishedAt)}
              </time>
              <span className={`absolute top-1.5 left-12 size-2 rounded-full ring-4 ring-surface ${active?.id === article.id ? "np-category-dot" : "np-gradient-bg"}`} aria-hidden="true" />
              <Link
                href={article.path}
                data-latest-id={article.id}
                prefetch={false}
                onMouseEnter={(event) => activate(article.id, event.currentTarget)}
                onFocus={(event) => activate(article.id, event.currentTarget)}
                className="-m-1.5 block rounded-lg p-1.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
              >
                {article.hero ? <img src={article.hero.url} alt="" loading="lazy" className="np-latest-mobile-thumb" aria-hidden="true" /> : null}
                <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-ink transition-colors group-hover:text-logo">{article.title}</h3>
                {article.category ? <span className="mt-0.5 block text-xs text-muted">{article.category.name}</span> : null}
              </Link>
            </li>
            </Fragment>
          ))}
        </ol>
      ) : (
        <p className="my-auto py-8 text-sm leading-relaxed text-muted">Няма публикувани новини през последните 24 часа.</p>
      )}
      {activeArticle && active ? <NewsPreview article={activeArticle} position={active} /> : null}
    </section>
  );
}
