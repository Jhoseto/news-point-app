"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DESKTOP_QUERY, VIEWPORT_COOKIE, viewportCookie } from "@/lib/viewport-shell";

const desktopSnapshot = () => matchMedia(DESKTOP_QUERY).matches;

function subscribe(callback: () => void) {
  const query = matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/**
 * Refresh the whole server layout on a breakpoint mismatch. Never remove
 * React's DOM or serialize both feed trees through a client boundary.
 */
export function ViewportShellGate({ ssrDesktop }: { ssrDesktop: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const desktop = useSyncExternalStore(subscribe, desktopSnapshot, () => ssrDesktop);

  useEffect(() => {
    document.cookie = viewportCookie(desktop, location.protocol === "https:");
    const recorded = document.cookie.split(";").some(part => part.trim() === `${VIEWPORT_COOKIE}=${desktop ? "desktop" : "mobile"}`);
    if (desktop === ssrDesktop || !recorded) return;
    // Debounce rapid resizing. Refresh preserves unaffected client state
    // including scroll, podcast playback and form inputs.
    const timer = window.setTimeout(() => router.refresh(), 150);
    return () => window.clearTimeout(timer);
  }, [desktop, ssrDesktop, pathname, router]);

  return null;
}
