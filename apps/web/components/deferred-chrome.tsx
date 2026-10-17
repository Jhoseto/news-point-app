"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { SpotlightField } from "./spotlight-field";
import { afterCriticalPageLoad } from "@/lib/deferred-page-work";

const LiveUpdates = dynamic(() => import("./live-updates").then((module) => module.LiveUpdates), { ssr: false });
const PwaInstall = dynamic(() => import("./pwa-install").then((module) => module.PwaInstall), { ssr: false });
const PushPromptToast = dynamic(() => import("./push-prompt-toast").then((module) => module.PushPromptToast), { ssr: false });
const PwaRegister = dynamic(() => import("./pwa-register").then((module) => module.PwaRegister), { ssr: false });
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
    // Network idle before load is not the critical path finishing: the hero may
    // still be downloading. Fonts/optional chrome must not race that image.
    const cancel = afterCriticalPageLoad(arm, 0, { skipConstrained: false });
    return () => {
      cancelled = true;
      cancel();
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
    </>
  );
}
