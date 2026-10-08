"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const LiveUpdates = dynamic(() => import("./live-updates").then((module) => module.LiveUpdates), { ssr: false });
const SpotlightField = dynamic(() => import("./spotlight-field").then((module) => module.SpotlightField), { ssr: false });
const PwaInstall = dynamic(() => import("./pwa-install").then((module) => module.PwaInstall), { ssr: false });
const PushPromptToast = dynamic(() => import("./push-prompt-toast").then((module) => module.PushPromptToast), { ssr: false });
const PwaRegister = dynamic(() => import("./pwa-register").then((module) => module.PwaRegister), { ssr: false });
const PwaSplash = dynamic(() => import("./pwa-splash").then((module) => module.PwaSplash), { ssr: false });

/**
 * Non-critical chrome: mount after first paint / idle so Lighthouse TBT and
 * main-thread work are not charged to the initial homepage interaction.
 */
export function DeferredChrome() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const arm = () => {
      if (cancelled) return;
      // Banner/footer Literata — keep off the render-blocking CSS + font chain.
      void import("../app/literata-bg.css");
      setReady(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(arm, { timeout: 2500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }
    const timeoutId = window.setTimeout(arm, 1);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!ready) return null;
  return (
    <>
      <LiveUpdates />
      <SpotlightField />
      <PwaInstall />
      <PushPromptToast />
      <PwaRegister />
      <PwaSplash />
    </>
  );
}
