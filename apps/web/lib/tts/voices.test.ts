import { describe, expect, it } from "vitest";
import {
  bulgarianVoices,
  pickVoice,
  qualityScore,
  sortByQuality,
  voiceTier,
  waitForVoices,
} from "./voices";

// Minimal Voice-shaped object — Vitest does not run a browser, so we mock what
// SpeechSynthesisVoice would carry. WebKit also adds `name` and `lang` as
// required by the spec, but for our purposes the surface is just the fields we
// read.
type VoiceLike = {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
};

const voice = (overrides: Partial<VoiceLike>): VoiceLike => ({
  voiceURI: overrides.voiceURI ?? "uri",
  name: overrides.name ?? "Voice",
  lang: overrides.lang ?? "bg-BG",
  localService: overrides.localService ?? false,
  default: overrides.default ?? false,
});

describe("bulgarianVoices", () => {
  it("filters by language prefix bg", () => {
    expect(
      bulgarianVoices([
        voice({ name: "Bg", lang: "bg-BG" }),
        voice({ name: "En", lang: "en-US" }),
        voice({ name: "De", lang: "de-DE" }),
      ]).map((v) => v.name),
    ).toEqual(["Bg"]);
  });

  it("treats the bare 'bg' tag as Bulgarian", () => {
    expect(
      bulgarianVoices([voice({ name: "Bare", lang: "bg" })]).map((v) => v.name),
    ).toEqual(["Bare"]);
  });

  it("is case-insensitive on the lang", () => {
    expect(
      bulgarianVoices([voice({ name: "Mixed", lang: "BG-bg" })]).map((v) => v.name),
    ).toEqual(["Mixed"]);
  });

  it("returns an empty array when no voices match", () => {
    expect(bulgarianVoices([voice({ name: "En", lang: "en-GB" })])).toEqual([]);
  });

  it("returns an empty array when the input is empty", () => {
    expect(bulgarianVoices([])).toEqual([]);
  });
});

describe("voiceTier", () => {
  it("returns 'extended' for cloud-quality names", () => {
    expect(voiceTier(voice({ name: "Microsoft Pavel - Online (Natural)" }))).toBe("extended");
    expect(voiceTier(voice({ name: "Google български" }))).toBe("extended");
  });

  it("returns 'compact' for short names", () => {
    expect(voiceTier(voice({ name: "bg-BG Compact" }))).toBe("compact");
  });

  it("returns 'local' for localService-only voices", () => {
    expect(voiceTier(voice({ name: "Plains", localService: true }))).toBe("local");
  });

  it("returns 'unknown' when no signal is present", () => {
    expect(voiceTier(voice({ name: "Strange", localService: false }))).toBe("unknown");
  });
});

describe("qualityScore and sortByQuality", () => {
  it("prefers localService voices", () => {
    const local = voice({ name: "Local", localService: true });
    const remote = voice({ name: "Remote", localService: false });
    expect(qualityScore(local)).toBeGreaterThan(qualityScore(remote));
  });

  it("prefers extended-tier voices over compact-tier voices", () => {
    const extended = voice({ name: "Online (Natural)" });
    const compact = voice({ name: "bg-Compact" });
    expect(qualityScore(extended)).toBeGreaterThan(qualityScore(compact));
  });

  it("sortByQuality returns highest-scoring voice first", () => {
    const voices = [
      voice({ name: "bg-Compact", voiceURI: "compact" }),
      voice({ name: "Microsoft Pavel - Online (Natural)", voiceURI: "natural" }),
      voice({ name: "Local Voice", voiceURI: "local", localService: true }),
    ];
    const sorted = sortByQuality(voices).map((v) => v.voiceURI);
    expect(sorted[0]).toBe("natural");
  });

  it("uses Bulgarian collation as a tiebreaker", () => {
    const a = voice({ name: "А", voiceURI: "a", localService: true });
    const b = voice({ name: "Б", voiceURI: "b", localService: true });
    expect(sortByQuality([b, a]).map((v) => v.voiceURI)).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    const voices = [voice({ name: "bg-Compact", voiceURI: "compact" })];
    const original = [...voices];
    sortByQuality(voices);
    expect(voices).toEqual(original);
  });
});

describe("pickVoice", () => {
  it("returns null when no voices exist", () => {
    expect(pickVoice([])).toBeNull();
  });

  it("prefers the named voice when present", () => {
    const voices = [
      voice({ name: "First", voiceURI: "first" }),
      voice({ name: "Second", voiceURI: "second" }),
    ];
    expect(pickVoice(voices, "second")?.voiceURI).toBe("second");
    expect(pickVoice(voices, "Second")?.voiceURI).toBe("second");
  });

  it("falls back to the highest-scoring voice when the preferred one is absent", () => {
    const voices = [
      voice({ name: "First", voiceURI: "first" }),
      voice({ name: "Online (Natural)", voiceURI: "natural" }),
    ];
    expect(pickVoice(voices, "missing")?.voiceURI).toBe("natural");
  });
});

describe("waitForVoices", () => {
  it("resolves to [] when window is undefined", async () => {
    const original = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      await expect(waitForVoices(50)).resolves.toEqual([]);
    } finally {
      (globalThis as { window?: unknown }).window = original;
    }
  });

  it("resolves to [] when speechSynthesis is missing", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {};
    try {
      await expect(waitForVoices(50)).resolves.toEqual([]);
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = originalWindow;
      }
    }
  });

  it("resolves immediately when voices are already present", async () => {
    const synth = {
      voices: [voice({ name: "Microsoft Pavel - Online (Natural)", voiceURI: "natural" })],
      getVoices: function () {
        return this.voices;
      },
      addEventListener: function () {
        // never called
      },
      removeEventListener: function () {
        // never called
      },
    };
    (globalThis as { window?: unknown }).window = { speechSynthesis: synth } as unknown;
    const list = await waitForVoices(50);
    expect(list.map((v) => v.voiceURI)).toEqual(["natural"]);
  });

  it("resolves when voiceschanged fires asynchronously", async () => {
    let listener: ((event: Event) => void) | null = null;
    const synth = {
      voices: [] as VoiceLike[],
      getVoices: function () {
        return this.voices;
      },
      addEventListener: function (_event: string, cb: (event: Event) => void) {
        listener = cb;
      },
      removeEventListener: function () {
        listener = null;
      },
    };
    (globalThis as { window?: unknown }).window = { speechSynthesis: synth } as unknown;
    const promise = waitForVoices(2000);
    queueMicrotask(() => {
      synth.voices.push(voice({ name: "Microsoft Pavel - Online (Natural)", voiceURI: "natural" }));
      listener?.(new Event("voiceschanged"));
    });
    const list = await promise;
    expect(list.map((v) => v.voiceURI)).toEqual(["natural"]);
  });
});