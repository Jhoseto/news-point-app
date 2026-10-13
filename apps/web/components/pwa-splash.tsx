"use client";

import { useLayoutEffect, useState } from "react";
import { BRAND_LOGO, BRAND_LOGO_DARK } from "@/lib/brand-logo";

const HOLD_MS = 420;
const FADE_MS = 320;

function standaloneReader(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

type SplashLogo = typeof BRAND_LOGO | typeof BRAND_LOGO_DARK;

function splashLogo(): SplashLogo {
  const dark =
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return dark ? BRAND_LOGO_DARK : BRAND_LOGO;
}

/**
 * Continuation after the static iOS/Android startup image: same wordmark, short hold, fade out.
 * Mounted from the root layout (not deferred) so it never flashes over an already-painted feed.
 */
export function PwaSplash() {
  const [phase, setPhase] = useState<"hidden" | "show" | "leave">("hidden");
  const [logo, setLogo] = useState<SplashLogo>(BRAND_LOGO);

  useLayoutEffect(() => {
    if (!standaloneReader()) return;
    if (sessionStorage.getItem("np-splash-shown") === "1") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sessionStorage.setItem("np-splash-shown", "1");
      return;
    }
    setLogo(splashLogo());
    setPhase("show");
    const leaveTimer = window.setTimeout(() => setPhase("leave"), HOLD_MS);
    const hideTimer = window.setTimeout(() => {
      setPhase("hidden");
      sessionStorage.setItem("np-splash-shown", "1");
    }, HOLD_MS + FADE_MS);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="np-pwa-splash"
      data-phase={phase}
    >
      <img
        className="np-pwa-splash-logo"
        src={logo.src}
        srcSet={logo.srcSet}
        sizes="(max-width: 640px) 72vw, 18rem"
        alt=""
        width={logo.width}
        height={logo.height}
        decoding="sync"
        fetchPriority="high"
      />
    </div>
  );
}
