/**
 * LocalStorage helpers for TTS state. The persistence model mirrors
 * `apps/web/lib/reader-preferences.ts`: a thin layer over `Pick<Storage, …>`
 * so it can be tested with a mock.
 */

const PREFIX = "np-tts-";
const POS_KEY = (articleId: string) => `${PREFIX}pos-${articleId}`;
const PREFS_KEY = `${PREFIX}prefs`;

export interface TtsPosition {
  index: number;
  charIndex: number;
  ts: number;
}

export interface TtsPrefs {
  voiceName: string | null;
  rate: number;
  pitch: number;
}

export const DEFAULT_PREFS: TtsPrefs = {
  voiceName: null,
  rate: 1,
  pitch: 1,
};

const POS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface PickStorage {
  getItem(key: string): string | null;
}

export interface FullStorage extends PickStorage {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): FullStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

class MemoryStorage implements FullStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

const DEFAULT_STORAGE: FullStorage = defaultStorage() ?? new MemoryStorage();

export function loadPos(articleId: string, storage: PickStorage = DEFAULT_STORAGE): TtsPosition | null {
  const raw = storage.getItem(POS_KEY(articleId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TtsPosition;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.index !== "number" ||
      typeof parsed.charIndex !== "number" ||
      typeof parsed.ts !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.ts > POS_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePos(articleId: string, position: TtsPosition, storage: FullStorage = DEFAULT_STORAGE): void {
  storage.setItem(POS_KEY(articleId), JSON.stringify(position));
}

export function clearPos(articleId: string, storage: FullStorage = DEFAULT_STORAGE): void {
  storage.removeItem(POS_KEY(articleId));
}

export function loadPrefs(storage: PickStorage = DEFAULT_STORAGE): TtsPrefs {
  const raw = storage.getItem(PREFS_KEY);
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<TtsPrefs>;
    return {
      voiceName: typeof parsed.voiceName === "string" ? parsed.voiceName : null,
      rate: typeof parsed.rate === "number" && parsed.rate > 0 && parsed.rate <= 4 ? parsed.rate : DEFAULT_PREFS.rate,
      pitch: typeof parsed.pitch === "number" && parsed.pitch > 0 && parsed.pitch <= 4 ? parsed.pitch : DEFAULT_PREFS.pitch,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: TtsPrefs, storage: FullStorage = DEFAULT_STORAGE): void {
  storage.setItem(PREFS_KEY, JSON.stringify(prefs));
}