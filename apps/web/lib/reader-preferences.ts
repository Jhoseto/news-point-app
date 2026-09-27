export const PREFERENCE_KEYS = { theme: "np-theme", text: "np-reader-text", motion: "np-reduced-motion" } as const;
export type ReaderPreferences = { theme: "system" | "light" | "dark"; text: "standard" | "larger" | "largest"; motion: "system" | "reduce" };
export const DEFAULT_PREFERENCES: ReaderPreferences = { theme: "system", text: "standard", motion: "system" };
export type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function normalizePreferences(values: Partial<Record<keyof ReaderPreferences, unknown>>): ReaderPreferences {
  return {
    theme: values.theme === "light" || values.theme === "dark" ? values.theme : "system",
    text: values.text === "larger" || values.text === "largest" ? values.text : "standard",
    motion: values.motion === "reduce" ? "reduce" : "system",
  };
}

export function readPreferences(storage: Pick<PreferenceStorage, "getItem">): ReaderPreferences {
  const values: Partial<Record<keyof ReaderPreferences, unknown>> = {};
  for (const key of Object.keys(PREFERENCE_KEYS) as (keyof ReaderPreferences)[]) {
    try { values[key] = storage.getItem(PREFERENCE_KEYS[key]); } catch { /* System defaults still apply. */ }
  }
  return normalizePreferences(values);
}

export function persistPreferences(storage: PreferenceStorage, preferences: ReaderPreferences): boolean {
  let saved = true;
  for (const key of Object.keys(PREFERENCE_KEYS) as (keyof ReaderPreferences)[]) {
    try {
      if (preferences[key] === DEFAULT_PREFERENCES[key]) storage.removeItem(PREFERENCE_KEYS[key]);
      else storage.setItem(PREFERENCE_KEYS[key], preferences[key]);
    } catch { saved = false; }
  }
  return saved;
}

export function resolvePreferences(preferences: ReaderPreferences, systemDark: boolean, systemReduce: boolean) {
  return {
    theme: preferences.theme === "system" ? (systemDark ? "dark" : "light") : preferences.theme,
    reducedMotion: systemReduce || preferences.motion === "reduce",
  };
}

// The same validators/resolver run before paint and in the client store.
export const READER_PREFERENCES_SCRIPT = `(${function bootstrap(keys: typeof PREFERENCE_KEYS, normalize: typeof normalizePreferences, resolve: typeof resolvePreferences) {
  const values: Partial<Record<keyof ReaderPreferences, unknown>> = {};
  for (const key of Object.keys(keys) as (keyof ReaderPreferences)[]) {
    try { values[key] = localStorage.getItem(keys[key]); } catch {}
  }
  const preferences = normalize(values);
  const resolved = resolve(preferences, matchMedia("(prefers-color-scheme: dark)").matches, matchMedia("(prefers-reduced-motion: reduce)").matches);
  const root = document.documentElement;
  root.dataset.theme = resolved.theme;
  root.style.colorScheme = resolved.theme;
  root.dataset.readerText = preferences.text;
  root.dataset.reducedMotion = String(resolved.reducedMotion);
}.toString()})(${JSON.stringify(PREFERENCE_KEYS)},${normalizePreferences.toString()},${resolvePreferences.toString()});`;
