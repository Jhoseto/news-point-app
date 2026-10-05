"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBrowserPushSubscription,
  openReaderSettings,
  readPushSupport,
  subscribeForPush,
} from "@/lib/push-client";
import { readPushMasterEnabled, readStoredPushRubrics, writePushMasterEnabled } from "@/lib/push-preferences";
import { CloseIcon } from "./icons";

const DISMISS_KEY = "np-push-prompt-dismissed-at";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 4000;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function dismissPrompt() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** Desktop-only nudge to enable Web Push (replaces PWA install banner on large screens). */
export function PushPromptToast() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = useCallback(() => {
    setVisible(false);
    dismissPrompt();
  }, []);

  useEffect(() => {
    const support = readPushSupport();
    if (!support.supported || support.needInstall) return;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 63.999rem)").matches) return;
    if (isDismissed()) return;

    const schedule = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const live = readPushSupport();
        const sub = await getBrowserPushSubscription();
        if (sub && live.permission === "granted" && readPushMasterEnabled()) return;
        setVisible(true);
      }, SHOW_DELAY_MS);
    };

    schedule();
    const onSub = () => hide();
    const onFocus = () => {
      void getBrowserPushSubscription().then((sub) => {
        const live = readPushSupport();
        if (sub && live.permission === "granted" && readPushMasterEnabled()) hide();
      });
    };
    window.addEventListener("np-push-subscribed", onSub);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("np-push-subscribed", onSub);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [hide]);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const slugs = readStoredPushRubrics();
      const result = await subscribeForPush({ categorySlugs: slugs, categorySlug: null });
      if (result.ok) {
        writePushMasterEnabled(true);
        window.dispatchEvent(new Event("np-push-subscribed"));
        hide();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Нотификации за новини"
      className="np-push-prompt fixed right-4 bottom-6 z-40 hidden max-w-sm lg:block"
    >
      <div className="np-toast pointer-events-auto">
        <div className="np-toast-inner">
          <div className="flex gap-3 p-3 pr-2">
            <div className="np-ring !size-10 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-ink">Новини по известие</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">
                Получавайте нови публикации дори когато NewsPoint не е отворен.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enable()}
                  className="np-gradient-bg inline-flex min-h-8 items-center rounded-full px-3.5 text-[11px] font-bold text-on-accent disabled:opacity-50"
                >
                  {busy ? "…" : "Включи нотификации"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hide();
                    openReaderSettings();
                  }}
                  className="inline-flex min-h-8 items-center rounded-full border border-line bg-surface-2 px-3 text-[11px] font-bold text-ink hover:bg-line/40"
                >
                  Настройки
                </button>
              </div>
            </div>
            <button
              type="button"
              aria-label="Затвори"
              onClick={hide}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
            >
              <CloseIcon width={16} height={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
