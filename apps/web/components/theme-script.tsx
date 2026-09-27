"use client";

import { useSyncExternalStore } from "react";
import { PREFERENCE_KEYS, READER_PREFERENCES_SCRIPT } from "@/lib/reader-preferences";

export const THEME_STORAGE_KEY = PREFERENCE_KEYS.theme;

// Runs before first paint so the page never flashes the wrong theme.
const THEME_SCRIPT = READER_PREFERENCES_SCRIPT;

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
