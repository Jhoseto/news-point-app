"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/format";
import { LIVE_EVENT_NAME, type LiveEvent } from "@/lib/live/events";
import { createLiveRefreshScheduler } from "@/lib/live/refresh";
import { NewArticleToast } from "./live-toast";

const REFRESH_DEBOUNCE_MS = 700;
const BANNER_MS = 9000;
const REFRESHED_MS = 4000;
const MAX_TOASTS = 3;
const SEEN_IDS_CAP = 200;
const SSE_RETRY_MS = 5_000;

const isMobileLiveUi = () => window.matchMedia("(max-width: 63.999rem)").matches;

/**
 * Keeps the open page current without F5. router.refresh() re-renders the
 * server components in place, so scroll position and focus stay put.
 *
 * Desktop (lg+): premium per-article toast cards (gradient frame, hero, sweep).
 * Mobile: one compact banner — tap scrolls home and refreshes (MOBILE_PLAN).
 */
export function LiveUpdates() {
  const router = useRouter();
  const [toasts, setToasts] = useState<LiveEvent[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [banner, setBanner] = useState<{ count: number; firstTitle: string } | null>(null);
  const [bannerId, setBannerId] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seenIds = useRef<Set<number>>(new Set());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      source = new EventSource("/api/live/");
      const refresh = createLiveRefreshScheduler(
        () => {
          startTransition(() => router.refresh());
          if (!isMobileLiveUi()) setRefreshedAt(new Date());
        },
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
          if (seenIds.current.size >= SEEN_IDS_CAP) seenIds.current.clear();
          seenIds.current.add(event.eventId);

          if (isMobileLiveUi()) {
            setBanner((current) => {
              const next = current
                ? { count: current.count + 1, firstTitle: current.firstTitle }
                : { count: 1, firstTitle: event.title };
              setBannerId(event.eventId);
              return next;
            });
            clearTimeout(hideTimer.current);
            hideTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
          } else {
            setToasts((current) =>
              [event, ...current.filter((toast) => toast.entityId !== event.entityId)].slice(0, MAX_TOASTS),
            );
          }
        }
        window.dispatchEvent(new Event("np:public-content-updated"));
        refresh.schedule();
      };

      const onError = () => {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => {
          if (!cancelled && source && source.readyState !== EventSource.OPEN) {
            source?.close();
            connect();
          }
        }, SSE_RETRY_MS);
      };

      source.addEventListener(LIVE_EVENT_NAME, onEvent as EventListener);
      source.addEventListener("error", onError);
      return () => {
        refresh.cancel();
        clearTimeout(hideTimer.current);
        source?.removeEventListener(LIVE_EVENT_NAME, onEvent as EventListener);
        source?.removeEventListener("error", onError);
        source?.close();
      };
    };

    const teardown = connect();
    return () => {
      cancelled = true;
      clearTimeout(hideTimer.current);
      clearTimeout(reconnectTimer.current);
      teardown?.();
    };
  }, [router]);

  useEffect(() => {
    if (!refreshedAt) return;
    const timer = setTimeout(() => setRefreshedAt(null), REFRESHED_MS);
    return () => clearTimeout(timer);
  }, [refreshedAt]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (new URLSearchParams(window.location.search).get("liveToastDemo") !== "1") return;
    const timer = window.setTimeout(() => {
      void fetch("/api/live/demo/", { method: "POST", cache: "no-store" });
    }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  const onBannerClick = () => {
    clearTimeout(hideTimer.current);
    setBanner(null);
    seenIds.current.clear();
    setRefreshing(true);
    startTransition(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    });
    window.setTimeout(() => setRefreshing(false), 1500);
  };

  const label = banner?.count === 1 ? "Има 1 нова новина" : `Има ${banner?.count ?? 0} нови новини`;

  return (
    <>
      {banner ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-4 top-[calc(var(--np-header-h)+1rem)] z-50 flex flex-col items-end gap-3 sm:left-auto sm:w-[25rem] lg:hidden"
        >
          <button
            key={bannerId}
            type="button"
            onClick={onBannerClick}
            disabled={refreshing}
            className="np-new-articles pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-card transition hover:bg-surface-2 disabled:opacity-70"
          >
            <span className="np-live-dot relative shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="np-gradient-text text-[0.6875rem] font-extrabold tracking-[0.14em] uppercase">
                {refreshing ? "Обновяване…" : label}
              </span>
              <span className="line-clamp-1 text-sm font-semibold text-ink">{banner.firstTitle}</span>
            </span>
            <Link
              href="/"
              prefetch={false}
              aria-label="Към началната страница"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-body"
            >
              ↑
            </Link>
          </button>
        </div>
      ) : null}

      {toasts.length ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-4 top-[calc(var(--np-header-h)+1rem)] z-50 hidden flex-col items-end gap-3 sm:left-auto sm:w-[25rem] lg:right-6 lg:flex"
        >
          {toasts.map((event) => (
            <div key={event.eventId} className="w-full">
              <NewArticleToast
                event={event}
                onDone={() => setToasts((current) => current.filter((toast) => toast.eventId !== event.eventId))}
              />
            </div>
          ))}
        </div>
      ) : null}

      {!toasts.length && refreshedAt ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-20 z-50 hidden justify-center px-4 lg:bottom-6 lg:flex"
        >
          <div className="np-card flex items-center gap-2 px-4 py-2 text-sm font-semibold text-ink">
            <span className="np-gradient-bg size-2 shrink-0 rounded-full" />
            Страницата е обновена · {formatClock(refreshedAt)}
          </div>
        </div>
      ) : null}
    </>
  );
}
