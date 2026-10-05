"use client";
import { useSyncExternalStore, type ReactNode } from "react";

const desktopSnapshot = () => matchMedia("(min-width: 64rem)").matches;
const serverSnapshot = () => true;

function subscribe(callback: () => void) {
  const query = matchMedia("(min-width: 64rem)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** Keep identical SSR/hydration; subsequent mobile routes never mount the hidden desktop tree. */
export function DesktopFeed({ children }: { children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribe, desktopSnapshot, serverSnapshot);
  return desktop ? children : null;
}
