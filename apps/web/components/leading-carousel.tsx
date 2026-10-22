"use client";
import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { shineDelayProp } from "@/lib/shine-style";
import type { ArticleSummary } from "@/lib/queries";
import { categoryAccentStyle } from "@/lib/category-accent";
import { CAROUSEL_SPEED, startCarouselAutoplay } from "@/lib/carousel-autoplay";
import { whenNearViewport } from "@/lib/deferred-page-work";
import { ArticleCard } from "./article-card";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { useReducedMotion } from "./reader-preferences";
import { carouselCloneCount } from "@/lib/carousel-clones";

const DRAG_THRESHOLD = 5;
const CarouselCard = memo(ArticleCard);

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
  compactCards = false,
  exactTime = false,
  speed = CAROUSEL_SPEED,
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
  /** Half-width cards for the mobile „Последни новини“ strip only. */
  compactCards?: boolean;
  /** Exact publish clock under each card. */
  exactTime?: boolean;
  /** CSS pixels per second, independent of card width or refresh rate. */
  speed?: number;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const firstSet = useRef<HTMLDivElement>(null);
  const autoplay = useRef<ReturnType<typeof startCarouselAutoplay> | null>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const suppressClick = useRef(false);
  const reduceMotion = useReducedMotion();
  // Originals remain SSR/accessible. Materialize copies only near the strip,
  // rather than doubling every offscreen carousel during initial hydration.
  const [loopCount, setLoopCount] = useState(0);
  const loopReady = loopCount > 0;
  const prepareLoop = useCallback(() => {
    const element = viewport.current, strip = firstSet.current;
    if (preview || !element || !strip) return;
    setLoopCount(carouselCloneCount(articles.length, element.clientWidth, strip.offsetWidth));
  }, [articles.length, preview]);
  useEffect(() => {
    if (preview || articles.length < 2) { setLoopCount(0); return; }
    const element = viewport.current;
    if (!element) return;
    return whenNearViewport(element, prepareLoop);
  }, [articles.length, preview, prepareLoop]);
  useEffect(() => {
    if (!loopReady || !viewport.current || !firstSet.current) return;
    const resize = new ResizeObserver(prepareLoop);
    resize.observe(viewport.current); resize.observe(firstSet.current);
    return () => resize.disconnect();
  }, [loopReady, prepareLoop]);
  const assignViewport = useCallback((element: HTMLDivElement | null) => {
    viewport.current = element;
    if (element && preview) element.scrollLeft = previewOffset;
  }, [preview, previewOffset]);

  useEffect(() => {
    const element = viewport.current;
    const set = firstSet.current;
    if (preview || !loopReady || !element || !set || reduceMotion || articles.length < 2) return;
    const controller = startCarouselAutoplay({
      viewport: element, strip: set, container: element.parentElement!, speed, motion, mobileOnly,
    });
    autoplay.current = controller;
    return () => {
      controller.destroy();
      autoplay.current = null;
    };
  }, [articles.length, motion, reduceMotion, preview, mobileOnly, speed, loopReady]);

  const move = useCallback((direction: -1 | 1) => {
    const element = viewport.current;
    const card = firstSet.current?.querySelector<HTMLElement>("[data-carousel-card]");
    if (!element || !card) return;
    const gap = Number.parseFloat(getComputedStyle(firstSet.current!).columnGap) || 0;
    const step = card.offsetWidth + gap;
    const width = firstSet.current!.offsetWidth;
    autoplay.current?.hold();
    if (direction < 0 && element.scrollLeft < step) element.scrollLeft += width;
    element.scrollBy({ left: direction * step, behavior: reduceMotion ? "instant" : "smooth" });
  }, [reduceMotion]);

  if (!articles.length) return null;

  const cards = (duplicate: boolean) =>
    (duplicate ? articles.slice(0, loopCount) : articles).map((article, index) => (
      <div
        key={`${duplicate ? "copy" : "original"}-${article.id}`}
        data-carousel-card
        aria-hidden={duplicate || undefined}
        className={compactCards ? "np-carousel-mobile-card np-carousel-mobile-card--compact shrink-0" : "np-carousel-mobile-card w-[17rem] shrink-0 sm:w-[18rem] xl:w-[19rem] 2xl:w-[20rem]"}
      >
        <CarouselCard
          article={article}
          tabbable={!duplicate}
          // Carousels are below the LCP fold; skip srcset on every card (not only clones).
          liteMedia
          exactTime={exactTime}
          {...shineDelayProp(duplicate ? undefined : shineDelays?.[index])}
        />
      </div>
    ));

  return (
    <section
      aria-labelledby={headingId}
      data-mobile-pager-ignore
      onFocusCapture={prepareLoop}
      onPointerDownCapture={prepareLoop}
      className={`group/carousel min-w-0${compactCards ? " np-carousel-compact" : ""}`}
    >
      <div className={`np-section-heading flex items-center justify-between gap-4 ${compactCards ? "mb-3" : "mb-5"}`} style={categoryAccentStyle(accentSlug)}>
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
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          const element = viewport.current;
          if (!element) return;
          drag.current = { active: true, startX: event.clientX, startScroll: element.scrollLeft, moved: false };
          suppressClick.current = false;
          autoplay.current?.pause("drag");
        }}
        onPointerMove={(event) => {
          const element = viewport.current;
          if (!element || !drag.current.active) return;
          const delta = event.clientX - drag.current.startX;
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
          const element = viewport.current;
          if (!drag.current.active) return;
          suppressClick.current = drag.current.moved;
          drag.current.active = false;
          autoplay.current?.resume("drag");
          if (element?.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          drag.current.active = false;
          suppressClick.current = false;
          autoplay.current?.resume("drag");
        }}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }}
      >
        <div className="flex w-max">
          <div ref={firstSet} className={`flex pr-5 ${compactCards ? "gap-2.5" : "gap-5"}`}>
            {cards(false)}
          </div>
          {loopReady ? (
            <div className={`flex pr-5 ${compactCards ? "gap-2.5" : "gap-5"}`} aria-hidden="true">
              {cards(true)}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
