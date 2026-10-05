"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const desktopSnapshot = () => matchMedia("(min-width: 64rem)").matches;
const mobileServerSnapshot = () => false;

function subscribe(callback: () => void) {
  const query = matchMedia("(min-width: 64rem)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** Mobile HTML stays in SSR; on desktop viewports the interactive mobile tree is not mounted. */
export function MobileFeedBoundary({ children }: { children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribe, desktopSnapshot, mobileServerSnapshot);
  return desktop ? null : children;
}
