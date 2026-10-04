"use client";

import { useEffect, useState } from "react";

/**
 * Читателски PWA инсталиране.
 * - Android (Chrome / Edge): `beforeinstallprompt` показва бутон. Не обещаваме инсталиране извън този диалог.
 * - iPhone (Safari): няма `beforeinstallprompt`. Показваме кратка инструкция за „Add to Home Screen"
 *   през системния лист за споделяне. Без отделен бутон, който обещава инсталиране без този лист.
 * - Вече инсталирано като PWA (`display-mode: standalone`): не показваме нищо.
 */
export function PwaInstall() {
  const [androidPrompt, setAndroidPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Already installed as PWA / iOS standalone / Android TWA.
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true) {
      setInstalled(true);
      return;
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setAndroidPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  const isIosSafari = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

  if (isIosSafari) {
    return (
      <div role="region" aria-label="Инсталиране на приложението" className="np-pwa-install fixed inset-x-3 bottom-20 z-30 flex items-start gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur lg:bottom-5">
        <div className="np-ring !size-9 shrink-0" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <strong className="font-bold text-ink">Добави NewsPoint.bg към началния екран</strong>
          <span className="text-muted">В Safari: сподели → „На началния екран".</span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Затвори"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
        >
          ✕
        </button>
      </div>
    );
  }

  if (androidPrompt) {
    const install = async () => {
      try {
        await androidPrompt.prompt();
        await androidPrompt.userChoice;
      } finally {
        setAndroidPrompt(null);
        setDismissed(true);
      }
    };
    return (
      <div role="region" aria-label="Инсталиране на приложението" className="np-pwa-install fixed inset-x-3 bottom-20 z-30 flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur lg:bottom-5">
        <div className="np-ring !size-9 shrink-0" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
          <strong className="font-bold text-ink">Инсталирай NewsPoint.bg</strong>
          <span className="text-muted">По-бързо четене и нотификации за новините.</span>
        </div>
        <button
          type="button"
          onClick={install}
          className="np-gradient-bg inline-flex min-h-9 items-center rounded-full px-4 py-1.5 text-sm font-bold text-on-accent"
        >
          Инсталирай
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Затвори"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};