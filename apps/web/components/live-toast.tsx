"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";
import { formatClock } from "@/lib/format";
import type { LiveEvent } from "@/lib/live/events";
import { CloseIcon } from "./icons";

const TOAST_MS = 9000;

/** Premium "new article" card. Hover or keyboard focus pauses the countdown. */
export function NewArticleToast({ event, onDone }: { event: LiveEvent; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(TOAST_MS);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holds = useRef({ hover: false, focus: false });

  const run = useCallback(() => {
    clearTimeout(timer.current);
    startedAt.current = Date.now();
    timer.current = setTimeout(() => setLeaving(true), remaining.current);
  }, []);

  const hold = (key: "hover" | "focus", on: boolean) => {
    const wasHeld = holds.current.hover || holds.current.focus;
    holds.current[key] = on;
    const isHeld = holds.current.hover || holds.current.focus;
    if (!wasHeld && isHeld) {
      clearTimeout(timer.current);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    } else if (wasHeld && !isHeld) {
      run();
    }
  };

  useEffect(() => {
    run();
    return () => clearTimeout(timer.current);
  }, [run]);

  const onAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (leaving && e.target === e.currentTarget) onDone();
  };

  const card = event.card;
  const publishedAt = card ? new Date(card.publishedAt) : new Date(event.occurredAt);

  return (
    <div
      className="np-toast pointer-events-auto"
      data-leaving={leaving || undefined}
      onAnimationEnd={onAnimationEnd}
      onMouseEnter={() => hold("hover", true)}
      onMouseLeave={() => hold("hover", false)}
      onFocus={() => hold("focus", true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hold("focus", false);
      }}
    >
      <div className="np-toast-inner">
        <div className="flex gap-4 p-4 pr-3">
          <Link
            href={event.path}
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setLeaving(true)}
            className="relative size-[5.5rem] shrink-0 overflow-hidden rounded-xl ring-1 ring-line"
          >
            {card?.image ? (
              <img src={card.image.url} alt="" decoding="async" className="np-toast-img np-img size-full" />
            ) : (
              <span className="np-img flex size-full items-center justify-center">
                <span className="np-ring scale-150" />
              </span>
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="np-live-dot" aria-hidden="true" />
              <span className="np-gradient-text text-[0.6875rem] font-extrabold tracking-[0.14em] uppercase">
                Нова статия
              </span>
              <span className="text-faint" aria-hidden="true">
                ·
              </span>
              <time dateTime={publishedAt.toISOString()} className="text-xs font-semibold text-muted tabular-nums">
                {formatClock(publishedAt)}
              </time>
              <button
                type="button"
                onClick={() => setLeaving(true)}
                aria-label="Скрий"
                className="-my-1 ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>
            {card?.category ? (
              <p className="mt-1.5 text-[0.6875rem] font-bold tracking-wide text-accent uppercase dark:text-link">
                {card.category.name}
              </p>
            ) : null}
            <Link
              href={event.path}
              onClick={() => setLeaving(true)}
              className="mt-1 line-clamp-3 text-[0.9375rem] leading-snug font-extrabold text-ink transition-colors hover:text-accent dark:hover:text-link"
            >
              {event.title}
            </Link>
          </div>
        </div>
        <div className="h-[3px] bg-surface-2" aria-hidden="true">
          <div className="np-toast-progress np-gradient-bg h-full" style={{ animationDuration: `${TOAST_MS}ms` }} />
        </div>
      </div>
    </div>
  );
}
