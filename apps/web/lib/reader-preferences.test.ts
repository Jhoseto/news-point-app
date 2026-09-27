import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { DEFAULT_PREFERENCES, PREFERENCE_KEYS, READER_PREFERENCES_SCRIPT, normalizePreferences, persistPreferences, readPreferences, resolvePreferences, type PreferenceStorage } from "./reader-preferences";

function storage(values: Record<string, string> = {}): PreferenceStorage {
  return { getItem: (key) => values[key] ?? null, setItem: (key, value) => { values[key] = value; }, removeItem: (key) => { delete values[key]; } };
}

describe("reader preferences", () => {
  it("accepts the existing theme key and ignores unknown values", () => {
    expect(readPreferences(storage({ "np-theme": "dark", "np-reader-text": "huge", "np-reduced-motion": "false" }))).toEqual({ ...DEFAULT_PREFERENCES, theme: "dark" });
    expect(normalizePreferences({ theme: null, text: {}, motion: 42 })).toEqual(DEFAULT_PREFERENCES);
  });
  it("writes only its three keys and removes default overrides", () => {
    const values = { "unrelated": "keep" };
    const local = storage(values);
    expect(persistPreferences(local, { theme: "dark", text: "largest", motion: "reduce" })).toBe(true);
    expect(readPreferences(local)).toEqual({ theme: "dark", text: "largest", motion: "reduce" });
    persistPreferences(local, DEFAULT_PREFERENCES);
    expect(values).toEqual({ unrelated: "keep" });
  });
  it("reports blocked writes and tolerates blocked reads", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(readPreferences(blocked)).toEqual(DEFAULT_PREFERENCES);
    expect(persistPreferences(blocked, DEFAULT_PREFERENCES)).toBe(false);
  });
  it("continues other reads when a single key fails", () => {
    expect(readPreferences({ getItem: (key) => {
      if (key === PREFERENCE_KEYS.theme) throw new Error("blocked");
      return key === PREFERENCE_KEYS.text ? "larger" : "reduce";
    } })).toEqual({ theme: "system", text: "larger", motion: "reduce" });
  });
  it("system reduced motion cannot be disabled by local preference", () => {
    expect(resolvePreferences(DEFAULT_PREFERENCES, true, true)).toEqual({ theme: "dark", reducedMotion: true });
    expect(resolvePreferences({ ...DEFAULT_PREFERENCES, theme: "light", motion: "reduce" }, true, false)).toEqual({ theme: "light", reducedMotion: true });
    expect(resolvePreferences(DEFAULT_PREFERENCES, false, false)).toEqual({ theme: "light", reducedMotion: false });
  });
  it.each(["larger", "largest"])("pre-paint applies stored %s size, theme and motion before hydration", (text) => {
    const root = { dataset: {}, style: {} };
    runInNewContext(READER_PREFERENCES_SCRIPT, {
      localStorage: storage({ "np-theme": "dark", "np-reader-text": text, "np-reduced-motion": "reduce" }),
      document: { documentElement: root }, matchMedia: () => ({ matches: false }),
    });
    expect(root).toEqual({ dataset: { theme: "dark", readerText: text, reducedMotion: "true" }, style: { colorScheme: "dark" } });
  });
  it("pre-paint still applies system preferences when accessing storage throws", () => {
    const root = { dataset: {}, style: {} };
    const sandbox = { document: { documentElement: root }, matchMedia: () => ({ matches: true }) };
    Object.defineProperty(sandbox, "localStorage", { get: () => { throw new Error("blocked"); } });
    runInNewContext(READER_PREFERENCES_SCRIPT, sandbox);
    expect(root).toEqual({ dataset: { theme: "dark", readerText: "standard", reducedMotion: "true" }, style: { colorScheme: "dark" } });
  });
});
