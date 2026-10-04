"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Web Push permission for the reader PWA.
 *
 *   - iOS Safari requires the page to be installed to the Home Screen
 *     (display-mode: standalone) and iOS 16.4+ before the browser
 *     exposes `PushSubscriptionManager`. The UI hides the toggle until that
 *     condition is met.
 *   - Permission is requested only after the reader makes an explicit
 *     choice — clicking "Разрешавам нотификации" — never on first paint.
 *   - The subscription is upserted on /api/push/subscribe and removed
 *     on /api/push/subscribe?endpoint=... when the reader disables.
 */

type Status = "checking" | "unsupported" | "blocked" | "ready" | "subscribed" | "denied";

function detectIosSafariStandalone(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isWebkit = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && isWebkit && standalone;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof window === "undefined" ? "" : window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function detectPushSupport(): { supported: boolean; status: Status; needInstall: boolean } {
  if (typeof window === "undefined") return { supported: false, status: "checking", needInstall: false };
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return { supported: false, status: "unsupported", needInstall: false };
  if (Notification.permission === "denied") return { supported: true, status: "blocked", needInstall: false };
  // Only iOS Safari truly requires the Home Screen step. Android Chrome,
  // iOS Chrome, desktop browsers and iPadOS-Safari-as-Mac all expose
  // push.serviceWorker / pushManager without an explicit install.
  const isIosSafariStandalone = detectIosSafariStandalone();
  const needInstall = !isIosSafariStandalone && isIosDevice();
  return { supported: true, status: "ready", needInstall };
}

export function PushPermission({ categorySlug }: { categorySlug?: string | null }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);
  const [needInstall, setNeedInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { supported, status: next, needInstall: install } = detectPushSupport();
    setSupported(supported);
    setStatus(next);
    setNeedInstall(install);
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const vapidRes = await fetch("/api/push/vapid", { cache: "no-store" });
      if (!vapidRes.ok) {
        setError("Сървърът не е конфигуриран за нотификации.");
        return;
      }
      const { publicKey } = (await vapidRes.json()) as { publicKey: string };
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError("Браузърът не върна валиден subscription.");
        return;
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          categorySlug: categorySlug ?? null,
          locale: navigator.language,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        setError("Заявката за абониране е неуспешна.");
        return;
      }
      setStatus("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неуспешна нотификация.");
    } finally {
      setBusy(false);
    }
  }, [busy, categorySlug, supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: "DELETE" });
      }
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при отписване.");
    } finally {
      setBusy(false);
    }
  }, [busy, supported]);

  if (status === "checking") return null;
  if (!supported) return null;
  if (needInstall) {
    return (
      <div role="status" aria-live="polite" className="np-card flex flex-col gap-2 p-4 text-sm">
        <strong className="font-bold text-ink">Нотификациите работят само в инсталираното приложение</strong>
        <span className="text-muted">Добавете NewsPoint.bg към началния екран от Safari (сподели → „На началния екран"), за да включите нотификации.</span>
      </div>
    );
  }
  if (status === "blocked") {
    return (
      <div role="status" className="np-card flex flex-col gap-2 p-4 text-sm">
        <strong className="font-bold text-ink">Нотификациите са изключени от настройките на браузъра</strong>
        <span className="text-muted">Отворете настройките на Safari и разрешете нотификации за NewsPoint.bg.</span>
      </div>
    );
  }
  if (status === "subscribed") {
    return (
      <div role="status" className="np-card flex items-center justify-between gap-3 p-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <strong className="font-bold text-ink">Получавате нотификации</strong>
          <span className="text-muted">{categorySlug ? `Само за рубрика „${categorySlug}".` : "За всички издания."}</span>
        </div>
        <button
          type="button"
          onClick={unsubscribe}
          disabled={busy}
          className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface-2 px-4 py-1.5 text-xs font-bold text-body transition hover:bg-line disabled:opacity-50"
        >
          {busy ? "…" : "Спри"}
        </button>
      </div>
    );
  }
  return (
    <div className="np-card flex flex-col gap-2 p-4 text-sm">
      <strong className="font-bold text-ink">Следете новините от NewsPoint.bg</strong>
      <span className="text-muted">
        {categorySlug
          ? `Известия само за нови публикации в „${categorySlug}".`
          : "Известия при всяка нова публикация."}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={subscribe}
          disabled={busy}
          className="np-gradient-bg inline-flex min-h-11 items-center rounded-full px-5 py-2 text-sm font-bold text-on-accent disabled:opacity-50"
        >
          {busy ? "…" : "Разрешавам нотификации"}
        </button>
        {error ? <span className="text-xs text-muted">{error}</span> : null}
      </div>
    </div>
  );
}