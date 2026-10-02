import { describe, expect, it } from "vitest";
import {
  clearPos,
  DEFAULT_PREFS,
  loadPos,
  loadPrefs,
  savePos,
  savePrefs,
} from "./storage";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe("loadPos / savePos / clearPos", () => {
  it("returns null when nothing was stored", () => {
    const storage = new MemoryStorage();
    expect(loadPos("article-1", storage)).toBeNull();
  });

  it("round-trips a stored position", () => {
    const storage = new MemoryStorage();
    savePos("article-1", { index: 3, charIndex: 42, ts: Date.now() }, storage);
    const pos = loadPos("article-1", storage);
    expect(pos).not.toBeNull();
    expect(pos?.index).toBe(3);
    expect(pos?.charIndex).toBe(42);
  });

  it("returns null for malformed JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem("np-tts-pos-article-1", "{not-json");
    expect(loadPos("article-1", storage)).toBeNull();
  });

  it("returns null when the shape is wrong", () => {
    const storage = new MemoryStorage();
    storage.setItem("np-tts-pos-article-1", JSON.stringify({ index: "no" }));
    expect(loadPos("article-1", storage)).toBeNull();
  });

  it("drops positions older than 30 days", () => {
    const storage = new MemoryStorage();
    const stale = { index: 1, charIndex: 0, ts: Date.now() - 31 * 24 * 60 * 60 * 1000 };
    storage.setItem("np-tts-pos-article-1", JSON.stringify(stale));
    expect(loadPos("article-1", storage)).toBeNull();
  });

  it("clearPos removes the entry", () => {
    const storage = new MemoryStorage();
    savePos("article-1", { index: 1, charIndex: 0, ts: Date.now() }, storage);
    clearPos("article-1", storage);
    expect(loadPos("article-1", storage)).toBeNull();
  });
});

describe("loadPrefs / savePrefs", () => {
  it("returns defaults when nothing is stored", () => {
    const storage = new MemoryStorage();
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
  });

  it("round-trips stored preferences", () => {
    const storage = new MemoryStorage();
    savePrefs({ voiceName: "Microsoft Pavel", rate: 1.25, pitch: 1 }, storage);
    expect(loadPrefs(storage)).toEqual({ voiceName: "Microsoft Pavel", rate: 1.25, pitch: 1 });
  });

  it("falls back to defaults for missing fields", () => {
    const storage = new MemoryStorage();
    storage.setItem("np-tts-prefs", JSON.stringify({ rate: 1.5 }));
    expect(loadPrefs(storage)).toEqual({ voiceName: null, rate: 1.5, pitch: DEFAULT_PREFS.pitch });
  });

  it("rejects out-of-range rates and pitches", () => {
    const storage = new MemoryStorage();
    storage.setItem("np-tts-prefs", JSON.stringify({ rate: -1, pitch: 99 }));
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
  });

  it("rejects malformed JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem("np-tts-prefs", "{nope");
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
  });
});