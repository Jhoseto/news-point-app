"use client";

import { useEffect } from "react";

/**
 * Register the reader service worker once per page load. Skips registration in
 * development so HMR stays simple.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const controller = navigator.serviceWorker.controller;
    if (controller) return;
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Silent: SW registration failure must not break the page.
        });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onUpdate = () => {
      // The new worker is waiting; reload once when the page first becomes hidden,
      // so the next visit starts with the fresh shell.
      if (controller_installed()) {
        navigator.serviceWorker.ready.then((registration) => {
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        });
      }
    };
    function controller_installed() {
      return navigator.serviceWorker.controller !== null;
    }
    navigator.serviceWorker.addEventListener("controllerchange", onUpdate);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onUpdate);
  }, []);

  return null;
}