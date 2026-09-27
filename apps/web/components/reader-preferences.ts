"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PREFERENCES, PREFERENCE_KEYS, normalizePreferences, persistPreferences, readPreferences, resolvePreferences, type ReaderPreferences } from "@/lib/reader-preferences";

type Snapshot = ReaderPreferences & { reducedMotion: boolean; effectiveTheme: "light" | "dark"; storageAvailable: boolean };
const serverSnapshot: Snapshot = { ...DEFAULT_PREFERENCES, reducedMotion: true, effectiveTheme: "light", storageAvailable: true };
let snapshot: Snapshot | undefined;
const listeners = new Set<() => void>();
let unsubscribeBrowser: (() => void) | undefined;

function resolve(preferences: ReaderPreferences, storageAvailable = true): Snapshot {
  const result = resolvePreferences(preferences, matchMedia("(prefers-color-scheme: dark)").matches, matchMedia("(prefers-reduced-motion: reduce)").matches);
  return { ...preferences, storageAvailable, reducedMotion: result.reducedMotion, effectiveTheme: result.theme };
}

function getSnapshot(): Snapshot {
  if (!snapshot) {
    let preferences = DEFAULT_PREFERENCES;
    let available = true;
    try {
      preferences = readPreferences({ getItem: (key) => {
        try { return localStorage.getItem(key); } catch { available = false; return null; }
      } });
    } catch { available = false; }
    snapshot = resolve(preferences, available);
  }
  return snapshot;
}

function apply(next: Snapshot) {
  snapshot = next;
  const root = document.documentElement;
  root.dataset.theme = next.effectiveTheme;
  root.style.colorScheme = next.effectiveTheme;
  root.dataset.readerText = next.text;
  root.dataset.reducedMotion = String(next.reducedMotion);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!unsubscribeBrowser) {
    const dark = matchMedia("(prefers-color-scheme: dark)");
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const systemChange = () => apply(resolve(getSnapshot(), getSnapshot().storageAvailable));
    const storageChange = (event: StorageEvent) => {
      if (event.key !== null && !Object.values(PREFERENCE_KEYS).includes(event.key as typeof PREFERENCE_KEYS[keyof typeof PREFERENCE_KEYS])) return;
      try {
        if (event.storageArea && event.storageArea !== localStorage) return;
        apply(resolve(readPreferences(localStorage)));
      } catch { /* Keep session preferences if storage becomes unavailable. */ }
    };
    dark.addEventListener("change", systemChange);
    motion.addEventListener("change", systemChange);
    window.addEventListener("storage", storageChange);
    apply(resolve(getSnapshot(), getSnapshot().storageAvailable));
    unsubscribeBrowser = () => {
      dark.removeEventListener("change", systemChange);
      motion.removeEventListener("change", systemChange);
      window.removeEventListener("storage", storageChange);
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { unsubscribeBrowser?.(); unsubscribeBrowser = undefined; }
  };
}

export function chooseReaderPreferences(change: Partial<ReaderPreferences>) {
  const next = normalizePreferences({ ...getSnapshot(), ...change });
  let saved = false;
  try { saved = persistPreferences(localStorage, next); } catch {}
  apply(resolve(next, saved));
}

export function useReaderPreferences() {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}

export function useReducedMotion() { return useReaderPreferences().reducedMotion; }
