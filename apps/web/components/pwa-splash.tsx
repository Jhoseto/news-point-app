"use client";

import { useEffect } from "react";

/** The head script owns the document's launch; hydration never starts/restarts it. */
export function PwaSplash() {
  useEffect(() => {
    (window as Window & { __npLaunch?: { ready: () => void } }).__npLaunch?.ready();
  }, []);

  // CSS loads artwork only during standalone launch. No browser image downloads.
  return (
    <div className="np-pwa-splash" role="presentation" aria-hidden="true">
      <div className="np-pwa-splash-stage">
      <div className="np-pwa-splash-aura" />
      <div className="np-pwa-splash-ribbon" />
      <svg className="np-pwa-splash-orbits" viewBox="0 0 600 600" fill="none">
        <defs>
          <linearGradient id="np-launch-orbit" x1="80" y1="220" x2="520" y2="380" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a0cad9" stopOpacity="0" />
            <stop offset=".45" stopColor="#7cbdcf" />
            <stop offset=".75" stopColor="#b1b9da" />
            <stop offset="1" stopColor="#b1b9da" stopOpacity="0" />
          </linearGradient>
        </defs>
        <ellipse cx="300" cy="300" rx="260" ry="155" transform="rotate(-26 300 300)" pathLength="1" />
        <ellipse cx="300" cy="300" rx="275" ry="180" transform="rotate(-26 300 300)" pathLength="1" />
      </svg>
      <div className="np-pwa-splash-scene">
        <div className="np-pwa-splash-art">
          <div className="np-pwa-splash-logo" />
          <span className="np-pwa-splash-sheen" />
        </div>
        <span className="np-pwa-splash-line" />
      </div>
      </div>
    </div>
  );
}
