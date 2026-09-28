"use client";

import { useCallback, useEffect, useRef } from "react";
import { shineDelayProp } from "@/lib/shine-style";
import type { ArticleSummary } from "@/lib/queries";
import { ArticleCard } from "./article-card";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { useReducedMotion } from "./reader-preferences";

const SPEED_PX_PER_SECOND = 18;
const DRAG_THRESHOLD = 5;

export function LeadingCarousel({
  articles,
  shineDelays,
}: {
  articles: ArticleSummary[];
  /** Precomputed on the homepage (server); one delay per article, originals only. */
  shineDelays?: number[];
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const firstSet = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const suppressClick = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const element = viewport.current;
    const set = firstSet.current;
    if (!element || !set || reduceMotion || articles.length < 2) return;

    let frame = 0;
    let previous = performance.now();
    let position = element.scrollLeft;
    const tick = (now: number) => {
      const width = set.offsetWidth;
      if (!paused.current && width > 0) {
        position += ((now - previous) / 1000) * SPEED_PX_PER_SECOND;
        if (position >= width) position -= width;
        element.scrollLeft = position;
      } else {
        // Keep the animation cursor in sync with touch, trackpad and arrow controls.
        position = element.scrollLeft;
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [articles.length, reduceMotion]);

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
        className="w-[17rem] shrink-0 sm:w-[18rem] xl:w-[19rem] 2xl:w-[20rem]"
      >
        <ArticleCard
          article={article}
          tabbable={!duplicate}
          {...shineDelayProp(duplicate ? undefined : shineDelays?.[index])}
        />
      </div>
    ));

  return (
    <section
      aria-labelledby="sec-leading"
      className="group/carousel min-w-0"
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
      onFocusCapture={() => (paused.current = true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) paused.current = false;
      }}
    >
      <div className="np-section-heading mb-5 flex items-center justify-between gap-4">
        <h2 id="sec-leading" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink sm:text-xl">
          <span className="np-ring" aria-hidden="true" />
          На Фокус
        </h2>
        <div className="order-2 flex items-center gap-2">
          <button type="button" onClick={() => move(-1)} aria-label="Предишни новини на фокус" className="np-carousel-button">
            <ChevronLeftIcon width={18} height={18} />
          </button>
          <button type="button" onClick={() => move(1)} aria-label="Следващи новини на фокус" className="np-carousel-button">
            <ChevronRightIcon width={18} height={18} />
          </button>
        </div>
      </div>

      <div
        ref={viewport}
        className="np-carousel-viewport -mx-1 cursor-grab overflow-x-auto px-1 pb-3 select-none active:cursor-grabbing"
        aria-label="10 новини на фокус"
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
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
          if (element?.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
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
          <div className="flex gap-5 pr-5" aria-hidden="true">
            {cards(true)}
          </div>
        </div>
      </div>
    </section>
  );
}
