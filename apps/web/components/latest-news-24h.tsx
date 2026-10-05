"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ArticleSummary } from "@/lib/queries";
import { categoryAccentStyle } from "@/lib/category-accent";
import { formatCardTime, formatClock, isoDate, timelineDayBreak } from "@/lib/format";
import { isLatestRowVisible, measureLatestFlyout, type LatestFlyout } from "@/lib/latest-preview";
import { TimelineDayBreak } from "./timeline-day-break";
import { inLatestWindow, nextLatestExpiryMs } from "@/lib/latest-window";
import { ArticleImage, CategoryLabel, CategoryPill, SectionTitle } from "./ui";

type ActivePreview = LatestFlyout & { id: string };

const SIZE_CLASS = {
  /** Fills the short homepage lead band. */
  band: "h-full min-h-0",
  /** Sticky rail on rubric and article pages. */
  rail: "np-latest-viewport min-h-0 max-lg:hidden",
} as const;

function NewsPreview({ article, position }: { article: ArticleSummary; position: ActivePreview }) {
  const accent = categoryAccentStyle(article.category?.slug);
  return (
    <>
      <span
        aria-hidden="true"
        className="np-latest-backdrop pointer-events-none fixed z-30 hidden lg:block"
        style={{ left: position.backdropLeft, top: position.backdropTop, width: position.backdropWidth, height: position.backdropHeight }}
      />
      <span
        aria-hidden="true"
        className="np-latest-connector pointer-events-none fixed z-30 hidden lg:block"
        style={{ left: position.connectorLeft, top: position.anchorY, width: position.connectorWidth, ...accent }}
      />
      <aside
        aria-hidden="true"
        className="np-latest-preview-shell pointer-events-none fixed z-30 hidden lg:block"
        style={{ left: position.cardLeft, top: position.cardTop, width: position.cardWidth, height: position.cardHeight, ...accent }}
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

function samePreview(current: ActivePreview | null, next: ActivePreview | null): boolean {
  if (current === next) return true;
  if (!current || !next) return false;
  return (Object.keys(next) as (keyof ActivePreview)[]).every((key) => current[key] === next[key]);
}

/**
 * Desktop list of the last 24 hours.
 * The hover card is portaled to the body and measured from `[data-np-latest-frame]`
 * plus `[data-np-latest-stage]` (the column it floats over). Callers only choose `size`.
 */
export function LatestNews24h({
  articles,
  asOfMs,
  dense = false,
  liveRefresh = false,
  size = "rail",
  className = "",
}: {
  articles: ArticleSummary[];
  asOfMs: number;
  dense?: boolean;
  liveRefresh?: boolean;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(asOfMs);
  const [feed, setFeed] = useState(articles);
  const [active, setActive] = useState<ActivePreview | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, inside: false });
  const placeRef = useRef<(link: HTMLElement) => void>(() => {});
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

  placeRef.current = (link: HTMLElement) => {
    const panel = panelRef.current;
    const frame = panel?.closest("[data-np-latest-frame]");
    const stage = frame?.querySelector("[data-np-latest-stage]");
    if (!panel || !(stage instanceof HTMLElement) || !window.matchMedia("(min-width: 1024px)").matches) return;
    const id = link.dataset.latestId;
    if (!id) return;
    const scroller = link.closest(".np-latest-panel-scroll");
    if (scroller instanceof HTMLElement && !isLatestRowVisible(link.getBoundingClientRect(), scroller.getBoundingClientRect())) {
      setActive((current) => current === null ? current : null);
      return;
    }
    const flyout = measureLatestFlyout({
      stage: stage.getBoundingClientRect(),
      panel: panel.getBoundingClientRect(),
      link: link.getBoundingClientRect(),
      viewportHeight: window.innerHeight,
    });
    const next = flyout ? { id, ...flyout } : null;
    setActive((current) => samePreview(current, next) ? current : next);
  };

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      const panel = panelRef.current;
      if (!panel) return;
      if (pointerRef.current.inside) {
        const hit = document.elementFromPoint(pointerRef.current.x, pointerRef.current.y);
        const link = hit instanceof Element ? hit.closest("a[data-latest-id]") : null;
        if (link instanceof HTMLElement && panel.contains(link)) {
          placeRef.current(link);
          return;
        }
      }
      const focused = panel.querySelector("a:focus[data-latest-id]");
      if (focused instanceof HTMLElement) {
        placeRef.current(focused);
        return;
      }
      setActive((current) => current === null ? current : null);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const rememberPointer = (event: { clientX: number; clientY: number }) => {
    pointerRef.current = { x: event.clientX, y: event.clientY, inside: true };
  };

  return (
    <section
      ref={panelRef}
      aria-labelledby={`${sectionId}-title`}
      id={sectionId}
      className={`np-card np-latest-panel z-20 flex min-h-0 flex-col scroll-mt-[var(--np-header-h)] ${dense ? "p-4" : "p-5"} ${SIZE_CLASS[size]} ${className}`}
      onMouseMove={rememberPointer}
      onMouseLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        pointerRef.current.inside = false;
        setActive(null);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActive(null);
      }}
    >
      <div className="np-latest-panel-body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SectionTitle id={`${sectionId}-title`}>Последни новини</SectionTitle>
        <p className="mb-3 flex shrink-0 items-center justify-between gap-2 text-[0.6875rem] font-semibold tracking-wide text-muted uppercase">
          <span>Последните 24 часа</span>
          <span className="tabular-nums">{visible.length} {visible.length === 1 ? "новина" : "новини"}</span>
        </p>
        {visible.length ? (
          <div className="np-scroll-soft np-latest-panel-scroll min-h-0 flex-1 pr-2">
          <ol
            aria-label="Публикации от последните 24 часа"
            className={`np-latest-panel-list relative flex flex-col before:pointer-events-none before:absolute before:top-2 before:bottom-2 before:left-[3.25rem] before:w-px before:bg-line ${dense ? "gap-2.5" : "gap-4"}`}
          >
            {visible.map((article, index) => (
              <Fragment key={article.id}>
                {timelineDayBreak(visible[index - 1]?.publishedAt, article.publishedAt) ? (
                  <TimelineDayBreak date={article.publishedAt} />
                ) : null}
                <li className={`group relative min-w-0 pl-16 pr-2 ${active?.id === article.id ? "np-latest-row-active" : ""}`} style={categoryAccentStyle(article.category?.slug)}>
                <time dateTime={isoDate(article.publishedAt)} className="absolute top-0.5 left-0 text-xs font-bold text-muted tabular-nums">
                  {formatClock(article.publishedAt)}
                </time>
                <span className={`absolute top-1.5 left-12 size-2 rounded-full ring-4 ring-surface ${active?.id === article.id ? "np-category-dot" : "np-gradient-bg"}`} aria-hidden="true" />
                <Link
                  href={article.path}
                  data-latest-id={article.id}
                  prefetch={false}
                  onMouseEnter={(event) => {
                    rememberPointer(event);
                    placeRef.current(event.currentTarget);
                  }}
                  onFocus={(event) => placeRef.current(event.currentTarget)}
                  className="-m-1.5 block min-w-0 rounded-lg p-1.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
                >
                  {article.hero ? <ArticleImage media={{ ...article.hero, alt: "" }} sizes="52px" className="np-latest-mobile-thumb" /> : null}
                  <h3 className="line-clamp-2 min-w-0 break-words text-sm leading-snug font-semibold text-ink transition-colors group-hover:text-logo">{article.title}</h3>
                  {article.category ? <span className="mt-0.5 block text-xs text-muted">{article.category.name}</span> : null}
                </Link>
              </li>
              </Fragment>
            ))}
          </ol>
          </div>
        ) : (
          <p className="my-auto py-8 text-sm leading-relaxed text-muted">Няма публикувани новини през последните 24 часа.</p>
        )}
      </div>
      {activeArticle && active && typeof document !== "undefined" ? createPortal(<NewsPreview article={activeArticle} position={active} />, document.body) : null}
    </section>
  );
}
