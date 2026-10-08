"use client";
import { desktopDistance } from "@/lib/desktop-viewport";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { shineDelayProp } from "@/lib/shine-style";
import type { ArticleSummary } from "@/lib/queries";
import { categoryAccentStyle } from "@/lib/category-accent";
import { ArticleCard } from "./article-card";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { useReducedMotion } from "./reader-preferences";

const SPEED_PX_PER_SECOND = 18;
const DRAG_THRESHOLD = 5;
/** Quiet window after the last scroll/touch before autoplay may write scrollLeft again. */
const AUTOPLAY_RESUME_MS = 900;

export function LeadingCarousel({
  articles,
  shineDelays,
  title = "На Фокус",
  headingId = "sec-leading",
  motion = "to-left",
  href,
  linkLabel = "Всички",
  accentSlug,
  preview = false,
  previewOffset = 0,
  mobileOnly = false,
}: {
  articles: ArticleSummary[];
  /** Precomputed on the homepage (server); one delay per article, originals only. */
  shineDelays?: number[];
  title?: string;
  headingId?: string;
  /** `to-left` is the focus strip. `to-right` moves cards from left to right. */
  motion?: "to-left" | "to-right";
  /** Archive link for the rubric (e.g. /na-fokus/). */
  href?: string;
  linkLabel?: string;
  accentSlug?: string;
  preview?: boolean;
  previewOffset?: number;
  mobileOnly?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const firstSet = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const touchResumeTimer = useRef<number | null>(null);
  const touchPausedUntil = useRef(0);
  const programmaticScroll = useRef(false);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const suppressClick = useRef(false);
  const reduceMotion = useReducedMotion();
  // Clone set is client-only so SSR HTML is half the carousel weight.
  const [loopReady, setLoopReady] = useState(false);
  useEffect(() => {
    setLoopReady(!preview && articles.length >= 2);
  }, [articles.length, preview]);
  const assignViewport = useCallback((element: HTMLDivElement | null) => {
    viewport.current = element;
    if (element && preview) element.scrollLeft = previewOffset;
  }, [preview, previewOffset]);

  const pauseAutoplay = useCallback((holdMs = AUTOPLAY_RESUME_MS) => {
    paused.current = true;
    touchPausedUntil.current = performance.now() + holdMs;
    if (touchResumeTimer.current !== null) window.clearTimeout(touchResumeTimer.current);
    touchResumeTimer.current = window.setTimeout(() => {
      paused.current = false;
      touchResumeTimer.current = null;
    }, holdMs);
  }, []);

  useEffect(() => () => {
    if (touchResumeTimer.current !== null) window.clearTimeout(touchResumeTimer.current);
  }, []);

  useEffect(() => {
    const element = viewport.current;
    const set = firstSet.current;
    if (preview || (mobileOnly && !matchMedia("(max-width: 63.999rem)").matches) || !element || !set || reduceMotion || articles.length < 2) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;

    let frame = 0;
    let previous = performance.now();
    let position = element.scrollLeft;
    // iOS keeps emitting scroll events during momentum long after touchend. A fixed
    // post-touch timer alone resumes autoplay while WebKit is still scrolling, and
    // writing scrollLeft every frame fights that inertia (Android finishes sooner).
    const onUserScroll = () => {
      if (!isMobile || programmaticScroll.current) return;
      pauseAutoplay();
      position = element.scrollLeft;
    };
    const onScrollEnd = () => {
      if (!isMobile || programmaticScroll.current) return;
      pauseAutoplay(AUTOPLAY_RESUME_MS);
      position = element.scrollLeft;
    };
    element.addEventListener("scroll", onUserScroll, { passive: true });
    element.addEventListener("scrollend", onScrollEnd);

    // Cache strip width — reading offsetWidth every frame forces layout (PSI reflow).
    let width = set.offsetWidth;
    let autoplayReady = false;
    const refreshWidth = () => {
      width = set.offsetWidth;
    };
    window.addEventListener("resize", refreshWidth);
    const armAutoplay = () => {
      autoplayReady = true;
      refreshWidth();
    };
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(armAutoplay, { timeout: 2000 })
        : 0;
    const autoplayTimer = idleId ? 0 : window.setTimeout(armAutoplay, 400);

    const tick = (now: number) => {
      if (document.documentElement.hasAttribute("data-mobile-pager-visual")) {
        previous = now; frame = requestAnimationFrame(tick); return;
      }
      const touchMomentumActive = isMobile && performance.now() < touchPausedUntil.current;
      const tickerPaused = !autoplayReady || (isMobile ? touchMomentumActive : paused.current);
      if (!tickerPaused && width > 0) {
        const step = ((now - previous) / 1000) * SPEED_PX_PER_SECOND;
        if (motion === "to-right") {
          if (position <= 0) position += width;
          position -= step;
          if (position < 0) position += width;
        } else {
          position += step;
          if (position >= width) position -= width;
        }
        programmaticScroll.current = true;
        element.scrollLeft = position;
        // Clear on the next frame so sync/async scroll listeners from this write are ignored.
        requestAnimationFrame(() => {
          programmaticScroll.current = false;
        });
      } else {
        // Keep the animation cursor in sync with touch, trackpad and arrow controls.
        position = element.scrollLeft;
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", refreshWidth);
      if (idleId && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
      if (autoplayTimer) window.clearTimeout(autoplayTimer);
      element.removeEventListener("scroll", onUserScroll);
      element.removeEventListener("scrollend", onScrollEnd);
    };
  }, [articles.length, motion, reduceMotion, preview, mobileOnly, pauseAutoplay]);

  const move = useCallback((direction: -1 | 1) => {
    const element = viewport.current;
    const card = firstSet.current?.querySelector<HTMLElement>("[data-carousel-card]");
    if (!element || !card) return;
    const gap = Number.parseFloat(getComputedStyle(firstSet.current!).columnGap) || 0;
    const step = card.offsetWidth + gap;
    const width = firstSet.current!.offsetWidth;
    if (direction < 0 && element.scrollLeft < step) element.scrollLeft += width;
    element.scrollBy({ left: direction * step, behavior: reduceMotion ? "instant" : "smooth" });
  }, [reduceMotion]);

  if (!articles.length) return null;

  const cards = (duplicate: boolean) =>
    articles.map((article, index) => (
      <div
        key={`${duplicate ? "copy" : "original"}-${article.id}`}
        data-carousel-card
        aria-hidden={duplicate || undefined}
        className="np-carousel-mobile-card w-[17rem] shrink-0 sm:w-[18rem] xl:w-[19rem] 2xl:w-[20rem]"
      >
        <ArticleCard
          article={article}
          tabbable={!duplicate}
          // Carousels are below the LCP fold; skip srcset on every card (not only clones).
          liteMedia
          {...shineDelayProp(duplicate ? undefined : shineDelays?.[index])}
        />
      </div>
    ));

  return (
    <section
      aria-labelledby={headingId}
      data-mobile-pager-ignore
      className="group/carousel min-w-0"
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
      onFocusCapture={() => (paused.current = true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) paused.current = false;
      }}
    >
      <div className="np-section-heading mb-5 flex items-center justify-between gap-4" style={categoryAccentStyle(accentSlug)}>
        <h2 id={headingId} className="flex min-w-0 items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink sm:text-xl">
          <span className="np-ring" aria-hidden="true" />
          {title}
        </h2>
        <div className="order-2 flex shrink-0 items-center gap-2">
          {href ? (
            <Link
              href={href}
              className="np-section-link group inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface/80 px-3 text-xs font-bold text-link shadow-[0_3px_12px_-8px_rgb(10_20_84/0.2)] transition-[border-color,background-color,box-shadow] hover:border-accent/30 hover:bg-surface hover:shadow-card sm:text-sm"
            >
              {linkLabel}
              <ArrowRightIcon width={15} height={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          ) : null}
          <button type="button" onClick={() => move(-1)} aria-label={`Предишни: ${title}`} className="np-carousel-button">
            <ChevronLeftIcon width={18} height={18} />
          </button>
          <button type="button" onClick={() => move(1)} aria-label={`Следващи: ${title}`} className="np-carousel-button">
            <ChevronRightIcon width={18} height={18} />
          </button>
        </div>
      </div>

      <div
        ref={assignViewport}
        className="np-carousel-viewport np-mobile-touch-carousel -mx-1 cursor-grab overflow-x-auto px-1 pb-3 select-none active:cursor-grabbing"
        aria-label={title}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.pointerType === "touch") {
            pauseAutoplay();
            return;
          }
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          const element = viewport.current;
          if (!element) return;
          drag.current = { active: true, startX: event.clientX, startScroll: element.scrollLeft, moved: false };
          suppressClick.current = false;
          paused.current = true;
        }}
        onPointerMove={(event) => {
          const element = viewport.current;
          if (!element || !drag.current.active) return;
          const delta = desktopDistance(event.clientX - drag.current.startX);
          if (Math.abs(delta) < DRAG_THRESHOLD) return;
          if (!drag.current.moved) {
            drag.current.moved = true;
            const width = firstSet.current?.offsetWidth ?? 0;
            // Shift onto the identical copy only once a drag starts, so a click still hits the link.
            if (width > 0 && element.scrollLeft < element.clientWidth) {
              element.scrollLeft += width;
              drag.current.startScroll += width;
            }
            element.setPointerCapture(event.pointerId);
          }
          element.scrollLeft = drag.current.startScroll - delta;
        }}
        onPointerUp={(event) => {
          if (event.pointerType === "touch") {
            pauseAutoplay();
            return;
          }
          const element = viewport.current;
          if (!drag.current.active) return;
          suppressClick.current = drag.current.moved;
          drag.current.active = false;
          if (element?.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (event.pointerType === "touch") pauseAutoplay();
          drag.current.active = false;
          suppressClick.current = false;
        }}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }}
      >
        <div className="flex w-max">
          <div ref={firstSet} className="flex gap-5 pr-5">
            {cards(false)}
          </div>
          {loopReady ? (
            <div className="flex gap-5 pr-5" aria-hidden="true">
              {cards(true)}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
