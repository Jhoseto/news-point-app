"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * Lazy mobile chrome island. BottomNav runs an `aria-current` matcher over
 * `usePathname()` and listens for header-sheet state changes via MutationObserver
 * — useful on phones but dead code on a desktop where BottomNav is `lg:hidden`.
 *
 * This wrapper only mounts the chrome when the viewport is under 64rem
 * (the lg breakpoint). SSR is skipped so the page does not wait for the
 * chrome client chunk.
 *
 * `MobileSearch` and `RubricsNav` stay in the static header SSR chunk
 * because they need to render in the desktop rail / mobile-sheet view
 * from the first paint.
 */

const BottomNav = dynamic(() => import("./nav").then((m) => m.BottomNav), {
  ssr: false,
  loading: () => null,
});

export function MobileChromeIsland() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 63.999rem)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (isMobile === null || !isMobile) return null;
  return <BottomNav />;
}