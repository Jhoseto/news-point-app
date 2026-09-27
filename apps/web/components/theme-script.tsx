"use client";

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "np-theme";

// Runs before first paint so the page never flashes the wrong theme.
const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.dataset.theme=d?"dark":"light";e.style.colorScheme=d?"dark":"light"}catch(_){}})();`;

const emptySubscribe = () => () => {};

/** True on SSR and the matching hydration pass; false on later client renders (React 19). */
function useIsServerRender() {
  return useSyncExternalStore(
    emptySubscribe,
    () => false,
    () => true,
  );
}

/** Root layout only — inline theme init before paint. */
export function ThemeScript() {
  if (!useIsServerRender()) return null;
  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}
