/**
 * Web Speech API voice discovery — pick the best Bulgarian voice on this device.
 *
 * Voices are exposed lazily by the browser. Chrome ships them
 * asynchronously after the `voiceschanged` event fires, so callers must
 * re-poll the list rather than trust the first empty array.
 */

export type VoiceQualityTier = "local" | "compact" | "extended" | "unknown";

export interface VoiceSnapshot {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

const BULGARIAN_PREFIX = "bg";

/** Read the voice list at this moment. Safe to call multiple times. */
export function readVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") {
    return [];
  }
  return window.speechSynthesis.getVoices();
}

/** Filter to Bulgarian voices. `lang.startsWith("bg")` matches `bg-BG`, `bg`, etc. */
export function bulgarianVoices(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return all.filter((voice) => voice.lang.toLowerCase().startsWith(BULGARIAN_PREFIX));
}

/** Heuristic quality score used to sort Bulgarian voices. */
export function qualityScore(voice: SpeechSynthesisVoice): number {
  let score = 0;
  const tier = voiceTier(voice);
  if (tier === "extended") score += 200;
  if (tier === "local") score += 100;
  if (tier === "compact") score += 40;
  // Longer, more descriptive names usually correspond to newer / cloud voices.
  if (voice.name.length > 12) score += 10;
  if (voice.default) score += 5;
  return score;
}

export function voiceTier(voice: SpeechSynthesisVoice): VoiceQualityTier {
  const name = voice.name;
  if (/extended|premium|neural|wavenet|enhanced|cloud|natural|online|microsoft|google|apple/i.test(name)) return "extended";
  if (/compact|small|basic/i.test(name)) return "compact";
  if (voice.localService) return "local";
  return "unknown";
}

/** Sort voices from best quality to weakest. */
export function sortByQuality(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => {
    const diff = qualityScore(b) - qualityScore(a);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "bg");
  });
}

/** Pick the highest-scoring voice, or fall back to the named voice if it is present. */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  preferred?: string | null,
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  if (preferred) {
    const match = voices.find((voice) => voice.voiceURI === preferred || voice.name === preferred);
    if (match) return match;
  }
  return sortByQuality(voices)[0] ?? null;
}

/** Wait for voices to load (Chrome returns an empty list until `voiceschanged` fires). */
export function waitForVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") {
      resolve([]);
      return;
    }
    const initial = readVoices();
    if (initial.length > 0) {
      resolve(initial);
      return;
    }
    const timer = setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      resolve(readVoices());
    }, timeoutMs);
    function onChange() {
      const next = readVoices();
      if (next.length === 0) return;
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      resolve(next);
    }
    window.speechSynthesis.addEventListener("voiceschanged", onChange, { once: true });
  });
}

/** Convert a `Voice` into a serialisable snapshot for logging / persistence. */
export function toSnapshot(voice: SpeechSynthesisVoice): VoiceSnapshot {
  return {
    voiceURI: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService,
    default: voice.default,
  };
}