"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

const desktopSnapshot = () => matchMedia("(min-width: 64rem)").matches;

function subscribe(callback: () => void) {
  const query = matchMedia("(min-width: 64rem)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/**
 * Removes a mismatched exclusive SSR shell after hydration when Client Hints
 * disagreed with the live viewport. Must not wrap feed children — that would
 * re-serialize the whole tree into the RSC/HTML payload.
 */
export function ViewportShellGate({
  shell,
  ssrDesktop,
}: {
  shell: "mobile" | "desktop";
  ssrDesktop: boolean;
}) {
  const desktop = useSyncExternalStore(subscribe, desktopSnapshot, () => ssrDesktop);

  useLayoutEffect(() => {
    const selector = shell === "mobile" ? "[data-np-mobile-shell]" : "[data-np-desktop-shell]";
    const root = document.querySelector<HTMLElement>(selector);
    if (!root) return;
    const keep = shell === "mobile" ? !desktop : desktop;
    if (!keep) root.remove();
  }, [desktop, shell]);

  return null;
}
