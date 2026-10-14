"use client";

import { useLayoutEffect, useState } from "react";

const DURATION_MS = 2600;
const EXIT_MS = 400;

function standaloneReader(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** The supplied logo is present from the server's first frame through the reveal. */
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
        <img
          className="np-pwa-splash-logo"
          src="/brand/pwa-launch-logo-1024.webp?v=3"
          srcSet="/brand/pwa-launch-logo-512.webp?v=3 512w, /brand/pwa-launch-logo-1024.webp?v=3 1024w"
          sizes="(max-width: 640px) 84vw, 42rem"
          alt=""
          width={1024}
          height={341}
          decoding="sync"
          loading="lazy"
        />
        <span className="np-pwa-splash-sheen" />
        <span className="np-pwa-splash-track"><span /></span>
      </div>
    </div>
  );
}
