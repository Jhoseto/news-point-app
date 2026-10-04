"use client";

import { useEffect, useState } from "react";

/**
 * PWA opening animation. Mounts only when the reader runs as an installed
 * PWA (`display-mode: standalone`). The system startup image already
 * shows the full logo as a static frame on iOS, so this layer is the
 * "live" continuation that runs in the app shell itself:
 *
 *   1. The four rings start slightly out of place and rotate to align.
 *   2. They settle into the same NewsPoint mark.
 *   3. The overlay fades out within 900 ms, regardless of network state.
 *
 * prefers-reduced-motion: the overlay is removed immediately and the
 * interface takes over without animation. No flicker on real phones.
 */

const ANIMATION_MS = 900;
const SHOW_DELAY_MS = 600;

export function PwaSplash() {
  // Start un-mounted on the server to avoid an SSR/CSR mismatch on non-PWA
  // pages (the splash flashes for half a second otherwise). Only the standalone
  // PWA path flips the state and shows the rings.
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!isStandalone) return;
    // Only show the splash for the first paint of the session.
    if (sessionStorage.getItem("np-splash-shown")) return;
    sessionStorage.setItem("np-splash-shown", "1");
    setMounted(true);
    setShow(true);
    const fade = setTimeout(() => setShow(false), SHOW_DELAY_MS);
    const unmount = setTimeout(() => setMounted(false), ANIMATION_MS + 200);
    return () => {
      clearTimeout(fade);
      clearTimeout(unmount);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="np-pwa-splash"
      data-visible={show || undefined}
      data-leaving={!show && mounted ? "" : undefined}
    >
      <div className="np-pwa-splash-rings" aria-hidden="true">
        <span className="np-pwa-splash-ring ring-a" />
        <span className="np-pwa-splash-ring ring-b" />
        <span className="np-pwa-splash-ring ring-c" />
        <span className="np-pwa-splash-ring ring-d" />
      </div>
      <div className="np-pwa-splash-mark" aria-hidden="true">
        <span className="np-pwa-splash-wordmark">NewsPoint.bg</span>
        <span className="np-pwa-splash-slogan">Гласът на истината</span>
      </div>
    </div>
  );
}