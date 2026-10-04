/**
 * Speech-synthesis playback state machine.
 *
 * Each utterance is fed to `speechSynthesis.speak()` separately; that
 * lets us change voice, rate, and pitch between blocks without
 * restarting the pipeline. `pause()` uses the platform's pause/resume
 * rather than re-speaking from the start of the current utterance,
 * because `boundary` events reset on pause.
 */

import type { Utterance } from "./utterances";
import { nextUtteranceIndex, previousUtteranceIndex } from "./utterances";

export type PlaybackPhase = "idle" | "playing" | "paused" | "stopped";

export interface PlaybackCallbacks {
  onPhase?: (phase: PlaybackPhase) => void;
  onBoundary?: (event: { utteranceIndex: number; charIndex: number; charLength: number }) => void;
  onError?: (message: string) => void;
}

export interface PlaybackOptions extends PlaybackCallbacks {
  utterances: readonly Utterance[];
  voice?: SpeechSynthesisVoice | null;
  rate?: number;
  pitch?: number;
  /** Override for testing — defaults to `globalThis.speechSynthesis`. */
  synth?: SpeechSynthesisLike | null;
}

export interface PlaybackController {
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  next(): void;
  previous(): void;
  seekTo(index: number): void;
  setRate(rate: number): void;
  setPitch(pitch: number): void;
  setVoice(voice: SpeechSynthesisVoice | null): void;
  /** Replace the utterance list. The current index is preserved when possible. */
  setUtterances(utterances: readonly Utterance[]): void;
  getPhase(): PlaybackPhase;
  getIndex(): number;
  destroy(): void;
}

export interface SpeechSynthesisLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  pause(): void;
  resume(): void;
}

function getDefaultSynth(): SpeechSynthesisLike | null {
  if (typeof window === "undefined") return null;
  return (window.speechSynthesis as SpeechSynthesisLike | undefined) ?? null;
}

export function createPlayback(options: PlaybackOptions): PlaybackController {
  let utterances: readonly Utterance[] = options.utterances;
  let voice = options.voice ?? null;
  let rate = options.rate ?? 1;
  let pitch = options.pitch ?? 1;
  const synth = options.synth ?? getDefaultSynth();
  let phase: PlaybackPhase = "idle";
  let index = 0;
  let token = 0;

  const firePhase = (next: PlaybackPhase) => {
    phase = next;
    options.onPhase?.(next);
  };

  const dropCurrent = () => {
    token += 1;
    try {
      synth?.cancel();
    } catch {
      /* ignore */
    }
  };

  const speakCurrent = () => {
    const u = utterances[index];
    if (!u || !synth) return;
    const mine = ++token;
    const utt = new SpeechSynthesisUtterance(u.text);
    if (voice) utt.voice = voice;
    utt.rate = rate;
    utt.pitch = pitch;
    utt.lang = "bg-BG";
    options.onBoundary?.({
      utteranceIndex: index,
      charIndex: 0,
      charLength: u.text.length,
    });
    utt.onboundary = (event: SpeechSynthesisEvent) => {
      if (mine !== token) return;
      if (event.name && event.name !== "word" && event.name !== "sentence") return;
      options.onBoundary?.({
        utteranceIndex: index,
        charIndex: typeof event.charIndex === "number" ? event.charIndex : 0,
        charLength: typeof event.charLength === "number" ? event.charLength : u.text.length,
      });
    };
    utt.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (mine !== token) return;
      const code = event.error ?? "unknown";
      if (code === "interrupted" || code === "canceled") {
        const next = nextUtteranceIndex(index, utterances.length);
        if (next === null) {
          index = 0;
          firePhase("stopped");
          return;
        }
        index = next;
        speakCurrent();
        return;
      }
      options.onError?.(code);
      firePhase("stopped");
    };
    utt.onend = (() => {
      if (mine !== token) return;
      const next = nextUtteranceIndex(index, utterances.length);
      if (next === null) {
        index = 0;
        firePhase("stopped");
        options.onBoundary?.({ utteranceIndex: 0, charIndex: 0, charLength: 0 });
        return;
      }
      index = next;
      speakCurrent();
    }) as unknown as SpeechSynthesisUtterance["onend"];
    synth.speak(utt);
  };

  const controller: PlaybackController = {
    play() {
      if (!synth) {
        options.onError?.("unavailable");
        return;
      }
      if (phase === "paused") {
        synth.resume();
        firePhase("playing");
        return;
      }
      if (phase === "playing") return;
      if (utterances.length === 0) {
        options.onError?.("empty");
        return;
      }
      speakCurrent();
      firePhase("playing");
    },
    pause() {
      if (!synth || phase !== "playing") return;
      synth.pause();
      firePhase("paused");
    },
    resume() {
      if (!synth || phase !== "paused") return;
      synth.resume();
      firePhase("playing");
    },
    stop() {
      dropCurrent();
      firePhase("stopped");
    },
    next() {
      const next = nextUtteranceIndex(index, utterances.length);
      if (next === null) return;
      index = next;
      if (phase === "playing" && synth) {
        dropCurrent();
        speakCurrent();
      } else {
        firePhase("stopped");
      }
    },
    previous() {
      const prev = previousUtteranceIndex(index);
      if (prev === null) return;
      index = prev;
      if (phase === "playing" && synth) {
        dropCurrent();
        speakCurrent();
      } else {
        firePhase("stopped");
      }
    },
    seekTo(target: number) {
      if (target < 0 || target >= utterances.length) return;
      index = target;
      if (!synth) return;
      if (phase === "playing") {
        dropCurrent();
        speakCurrent();
        return;
      }
      if (phase === "paused") {
        dropCurrent();
        firePhase("stopped");
      }
    },
    setRate(value: number) {
      rate = clamp(value, 0.25, 4);
      if (phase === "playing" && synth) {
        dropCurrent();
        speakCurrent();
      }
    },
    setPitch(value: number) {
      pitch = clamp(value, 0, 2);
      if (phase === "playing" && synth) {
        dropCurrent();
        speakCurrent();
      }
    },
    setVoice(nextVoice: SpeechSynthesisVoice | null) {
      voice = nextVoice;
      if (phase === "playing" && synth) {
        dropCurrent();
        speakCurrent();
      }
    },
    setUtterances(next: readonly Utterance[]) {
      utterances = next;
      if (index >= next.length) index = Math.max(0, next.length - 1);
    },
    getPhase() {
      return phase;
    },
    getIndex() {
      return index;
    },
    destroy() {
      dropCurrent();
      phase = "stopped";
    },
  };

  return controller;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}