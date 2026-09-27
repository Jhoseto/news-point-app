"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { formatClock } from "@/lib/format";
import { LIVE_EVENT_NAME, type LiveEvent } from "@/lib/live/events";
import { createLiveRefreshScheduler } from "@/lib/live/refresh";
import { NewArticleToast } from "./live-toast";

// Several events in a row produce one refresh.
const REFRESH_DEBOUNCE_MS = 700;
const REFRESHED_MS = 4000;
const MAX_TOASTS = 3;

/**
 * Keeps the open page current without F5. router.refresh() re-renders the
 * server components in place, so scroll position and focus stay put.
 */
export function LiveUpdates() {
  const router = useRouter();
  const [toasts, setToasts] = useState<LiveEvent[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/live/");
    // Archive readers explicitly navigate their fixed set. Keep the toast,
    // but don't change their cards, sidebar, scroll or focused link via SSE.
    const refresh = createLiveRefreshScheduler(() => {
      startTransition(() => router.refresh());
      setRefreshedAt(new Date());
    }, () => !!document.querySelector("[data-np-category-archive], [data-np-search-archive]"), REFRESH_DEBOUNCE_MS);

    const onEvent = (message: MessageEvent<string>) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(message.data) as LiveEvent;
      } catch {
        return;
      }
      if (event.type === "article.published" && event.card) {
        setToasts((current) =>
          [event, ...current.filter((toast) => toast.entityId !== event.entityId)].slice(0, MAX_TOASTS),
        );
      }
      refresh.schedule();
    };

    source.addEventListener(LIVE_EVENT_NAME, onEvent as EventListener);
    return () => {
      refresh.cancel();
      source.removeEventListener(LIVE_EVENT_NAME, onEvent as EventListener);
      source.close();
    };
  }, [router]);

  useEffect(() => {
    if (!refreshedAt) return;
    const timer = setTimeout(() => setRefreshedAt(null), REFRESHED_MS);
    return () => clearTimeout(timer);
  }, [refreshedAt]);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-[calc(var(--np-header-h)+1rem)] z-50 flex flex-col items-end gap-3 sm:left-auto sm:w-[25rem] lg:right-6"
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
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6"
      >
        {!toasts.length && refreshedAt ? (
          <div className="np-card flex items-center gap-2 px-4 py-2 text-sm font-semibold text-ink">
            <span className="np-gradient-bg size-2 shrink-0 rounded-full" />
            Страницата е обновена · {formatClock(refreshedAt)}
          </div>
        ) : null}
      </div>
    </>
  );
}
