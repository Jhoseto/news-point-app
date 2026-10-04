"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { LIVE_EVENT_NAME, type LiveEvent } from "@/lib/live/events";
import { createLiveRefreshScheduler } from "@/lib/live/refresh";

// Several events in a row produce one refresh.
const REFRESH_DEBOUNCE_MS = 700;
const BANNER_MS = 9000;

/**
 * Keeps the open page current without F5. router.refresh() re-renders the
 * server components in place, so scroll position and focus stay put.
 *
 * When new articles arrive, the plan calls for a single small banner that
 * says "Има нови новини". Tapping it scrolls the new articles into view
 * and refreshes the page. Individual per-article cards are noisy; the
 * banner stays put even with 30 new stories and never rearranges the
 * cards that the reader is currently looking at.
 */
export function LiveUpdates() {
  const router = useRouter();
  const [banner, setBanner] = useState<{ count: number; firstTitle: string } | null>(null);
  const [bannerId, setBannerId] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seenIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    const source = new EventSource("/api/live/");
    const refresh = createLiveRefreshScheduler(
      () => startTransition(() => router.refresh()),
      () => !!document.querySelector("[data-np-category-archive], [data-np-search-archive]"),
      REFRESH_DEBOUNCE_MS,
    );

    const onEvent = (message: MessageEvent<string>) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(message.data) as LiveEvent;
      } catch {
        return;
      }
      if (event.type === "layout.updated") {
        const here = window.location.pathname;
        const same = event.path === "/" ? here === "/" : here.replace(/\/$/, "") === event.path.replace(/\/$/, "");
        if (same) startTransition(() => router.refresh());
        return;
      }
      if (event.type === "article.published" && event.card) {
        if (seenIds.current.has(event.eventId)) return;
        seenIds.current.add(event.eventId);
        setBanner((current) => {
          const next = current ? { count: current.count + 1, firstTitle: current.firstTitle } : { count: 1, firstTitle: event.title };
          setBannerId(event.eventId);
          return next;
        });
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
      }
      window.dispatchEvent(new Event("np:public-content-updated"));
      refresh.schedule();
    };

    source.addEventListener(LIVE_EVENT_NAME, onEvent as EventListener);
    return () => {
      refresh.cancel();
      clearTimeout(hideTimer.current);
      source.removeEventListener(LIVE_EVENT_NAME, onEvent as EventListener);
      source.close();
    };
  }, [router]);

  const onClick = () => {
    clearTimeout(hideTimer.current);
    setBanner(null);
    seenIds.current.clear();
    startTransition(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    });
  };

  if (!banner) return null;

  const label = banner.count === 1 ? "Има 1 нова новина" : `Има ${banner.count} нови новини`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-[calc(var(--np-header-h)+1rem)] z-50 flex flex-col items-end gap-3 sm:left-auto sm:w-[25rem] lg:right-6"
    >
      <button
        key={bannerId}
        type="button"
        onClick={onClick}
        className="np-new-articles pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-card transition hover:bg-surface-2"
      >
        <span className="np-live-dot relative shrink-0" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="np-gradient-text text-[0.6875rem] font-extrabold tracking-[0.14em] uppercase">{label}</span>
          <span className="line-clamp-1 text-sm font-semibold text-ink">{banner.firstTitle}</span>
        </span>
        <Link
          href="/api/live/"
          prefetch={false}
          aria-label="Към емисията"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-body"
        >
          ↑
        </Link>
      </button>
    </div>
  );
}
