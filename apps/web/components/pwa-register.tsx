"use client";

import { useEffect } from "react";
import { ensureReaderServiceWorker, readPushServerState, readPushSupport } from "@/lib/push-client";

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    let closed = false;
    let reconciling = false;
    let updatedAt = 0;
    const check = async () => {
      if (document.visibilityState === "hidden") {
        registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      if (reconciling) return;
      reconciling = true;
      try {
        registration = await ensureReaderServiceWorker();
        if (closed) return;
        if (Date.now() - updatedAt > 60 * 60_000) {
          updatedAt = Date.now();
          void registration.update().catch(() => {});
        }
        if (readPushSupport().permission === "granted") await readPushServerState();
        if (!closed) window.dispatchEvent(new Event("np-pwa-ready"));
      } catch {
        // Push UI reports retryable errors. Normal reading continues.
      } finally { reconciling = false; }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") void check();
    };
    const onResume = () => { void check(); };
    void check();
    window.addEventListener("online", onResume);
    document.addEventListener("visibilitychange", onResume);
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      closed = true;
      window.removeEventListener("online", onResume);
      document.removeEventListener("visibilitychange", onResume);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
