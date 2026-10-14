"use client";

import { useLayoutEffect, useState } from "react";

const DURATION_MS = 2600;
const EXIT_MS = 400;

function standaloneReader(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** The server-rendered first frame matches the static OS launch image. */
export function PwaSplash() {
  const [phase, setPhase] = useState<"ready" | "play" | "leave" | "hidden">("ready");

  useLayoutEffect(() => {
    if (!standaloneReader() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("hidden");
      return;
    }
    setPhase("play");
    const leaveTimer = window.setTimeout(() => setPhase("leave"), DURATION_MS);
    const hideTimer = window.setTimeout(() => {
      setPhase("hidden");
    }, DURATION_MS + EXIT_MS);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div className="np-pwa-splash" data-phase={phase} role="presentation" aria-hidden="true">
      <div className="np-pwa-splash-scene">
        <span className="np-pwa-splash-mark">
          <svg viewBox="0 0 92 92" fill="none" aria-hidden="true">
            <path className="np-pwa-splash-n" d="M28 68V24L64 68V24" />
          </svg>
        </span>
        <span className="np-pwa-splash-name">NewsPoint<span>.bg</span></span>
        <span className="np-pwa-splash-tagline">Гласът на истината</span>
        <span className="np-pwa-splash-track"><span /></span>
      </div>
    </div>
  );
}
