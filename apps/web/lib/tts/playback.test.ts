import { describe, expect, it, vi } from "vitest";
import type { Utterance } from "./utterances";
import { createPlayback, type SpeechSynthesisLike } from "./playback";

// Web Speech API polyfill — Node has no SpeechSynthesisUtterance.
class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  lang = "bg-BG";
  voice: SpeechSynthesisVoice | null = null;
  onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

(globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = FakeUtterance;

interface RecordedUtterance {
  text: string;
  rate: number;
  pitch: number;
  lang: string;
  voice: SpeechSynthesisVoice | null;
  onboundary: ((event: SpeechSynthesisEvent) => void) | null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null;
  onend: SpeechSynthesisUtterance["onend"];
}

class FakeSynth implements SpeechSynthesisLike {
  spoken: RecordedUtterance[] = [];
  cancelled = 0;
  paused = 0;
  resumed = 0;
  speak(utt: SpeechSynthesisUtterance) {
    this.spoken.push({
      text: utt.text,
      rate: utt.rate,
      pitch: utt.pitch,
      lang: utt.lang,
      voice: utt.voice ?? null,
      onboundary: utt.onboundary ?? null,
      onerror: utt.onerror ?? null,
      onend: utt.onend ?? null,
    });
  }
  cancel() {
    this.cancelled += 1;
  }
  pause() {
    this.paused += 1;
  }
  resume() {
    this.resumed += 1;
  }
}

const sampleUtterances: Utterance[] = [
  { id: "a::title", kind: "title", text: "Заглавие", blockIndex: -1 },
  { id: "a::p1", kind: "paragraph", text: "Първи параграф", blockIndex: 0 },
  { id: "a::p2", kind: "paragraph", text: "Втори параграф", blockIndex: 1 },
];

const fakeVoice = (): SpeechSynthesisVoice => ({
  voiceURI: "bg",
  name: "Microsoft Pavel",
  lang: "bg-BG",
  localService: false,
  default: false,
});

describe("createPlayback", () => {
  it("does not speak when there are no utterances", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: [], synth });
    controller.play();
    expect(synth.spoken).toEqual([]);
    expect(controller.getPhase()).toBe("idle");
  });

  it("reports unavailable when no synth is available", () => {
    const onError = vi.fn();
    const controller = createPlayback({ utterances: sampleUtterances, synth: null, onError });
    controller.play();
    expect(onError).toHaveBeenCalledWith("unavailable");
  });

  it("speaks the first utterance when play() is called", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0]?.text).toBe("Заглавие");
    expect(controller.getPhase()).toBe("playing");
  });

  it("applies voice, rate, and pitch to the utterance", () => {
    const synth = new FakeSynth();
    const voice = fakeVoice();
    const controller = createPlayback({ utterances: sampleUtterances, synth, voice, rate: 1.5, pitch: 1.1 });
    controller.play();
    expect(synth.spoken[0]?.voice).toBe(voice);
    expect(synth.spoken[0]?.rate).toBe(1.5);
    expect(synth.spoken[0]?.pitch).toBe(1.1);
    expect(synth.spoken[0]?.lang).toBe("bg-BG");
  });

  it("emits the playing phase on play()", () => {
    const onPhase = vi.fn();
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth, onPhase });
    controller.play();
    expect(onPhase).toHaveBeenLastCalledWith("playing");
  });

  it("pause() emits the paused phase and calls synth.pause()", () => {
    const onPhase = vi.fn();
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth, onPhase });
    controller.play();
    controller.pause();
    expect(synth.paused).toBe(1);
    expect(onPhase).toHaveBeenLastCalledWith("paused");
  });

  it("pause() is a no-op when not playing", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.pause();
    expect(synth.paused).toBe(0);
  });

  it("resume() restores the playing phase", () => {
    const onPhase = vi.fn();
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth, onPhase });
    controller.play();
    controller.pause();
    controller.resume();
    expect(synth.resumed).toBe(1);
    expect(onPhase).toHaveBeenLastCalledWith("playing");
  });

  it("stop() cancels current speech and emits the stopped phase", () => {
    const onPhase = vi.fn();
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth, onPhase });
    controller.play();
    controller.stop();
    expect(synth.cancelled).toBe(1);
    expect(onPhase).toHaveBeenLastCalledWith("stopped");
  });

  it("end event speaks the next one and stops at the end", () => {
    const synth = new FakeSynth();
    const onPhase = vi.fn();
    const controller = createPlayback({ utterances: sampleUtterances, synth, onPhase });
    controller.play();
    const first = synth.spoken[0];
    expect(first).toBeDefined();
    (first?.onend as unknown as (e: SpeechSynthesisEvent) => void)?.call(first, {} as SpeechSynthesisEvent);
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1]?.text).toBe("Първи параграф");
    expect(controller.getIndex()).toBe(1);
    (synth.spoken[1]?.onend as unknown as (e: SpeechSynthesisEvent) => void)?.call(synth.spoken[1], {} as SpeechSynthesisEvent);
    expect(synth.spoken).toHaveLength(3);
    expect(synth.spoken[2]?.text).toBe("Втори параграф");
    (synth.spoken[2]?.onend as unknown as (e: SpeechSynthesisEvent) => void)?.call(synth.spoken[2], {} as SpeechSynthesisEvent);
    expect(controller.getPhase()).toBe("stopped");
    expect(synth.spoken).toHaveLength(3);
  });

  it("an interrupted utterance continues with the next sentence", () => {
    const onPhase = vi.fn();
    const onError = vi.fn();
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth, onPhase, onError });
    controller.play();
    synth.spoken[0]?.onerror?.({ error: "interrupted" } as SpeechSynthesisErrorEvent);
    expect(onError).not.toHaveBeenCalled();
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1]?.text).toBe("Първи параграф");
    expect(controller.getPhase()).toBe("playing");
  });

  it("a synthesis failure stops the playback", () => {
    const onPhase = vi.fn();
    const onError = vi.fn();
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth, onPhase, onError });
    controller.play();
    synth.spoken[0]?.onerror?.({ error: "synthesis-failed" } as SpeechSynthesisErrorEvent);
    expect(onError).toHaveBeenCalledWith("synthesis-failed");
    expect(onPhase).toHaveBeenLastCalledWith("stopped");
  });

  it("boundary event forwards charIndex and charLength", () => {
    const onBoundary = vi.fn();
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth, onBoundary });
    controller.play();
    synth.spoken[0]?.onboundary?.({
      name: "word",
      charIndex: 2,
      charLength: 4,
    } as unknown as SpeechSynthesisEvent);
    expect(onBoundary).toHaveBeenCalledWith({
      utteranceIndex: 0,
      charIndex: 2,
      charLength: 4,
    });
  });

  it("ignores boundary events that are not word or sentence", () => {
    const onBoundary = vi.fn();
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth, onBoundary });
    controller.play();
    onBoundary.mockClear();
    synth.spoken[0]?.onboundary?.({
      name: "mark",
      charIndex: 0,
      charLength: 1,
    } as unknown as SpeechSynthesisEvent);
    expect(onBoundary).not.toHaveBeenCalled();
  });

  it("next() advances to the following utterance and re-speaks when playing", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    controller.next();
    expect(controller.getIndex()).toBe(1);
    expect(synth.spoken).toHaveLength(2);
  });

  it("next() does nothing at the end", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    controller.next();
    controller.next();
    controller.next();
    expect(controller.getIndex()).toBe(2);
  });

  it("previous() returns to the previous utterance", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    controller.next();
    controller.previous();
    expect(controller.getIndex()).toBe(0);
  });

  it("seekTo() jumps to a chosen utterance while playing", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    controller.seekTo(2);
    expect(controller.getIndex()).toBe(2);
    expect(synth.spoken[synth.spoken.length - 1]?.text).toBe("Втори параграф");
  });

  it("seekTo() out of range is a no-op", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    controller.seekTo(-1);
    controller.seekTo(99);
    expect(controller.getIndex()).toBe(0);
  });

  it("setRate() clamps and re-speaks when playing", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    controller.setRate(10);
    expect(synth.spoken[synth.spoken.length - 1]?.rate).toBe(4);
    controller.setRate(0);
    expect(synth.spoken[synth.spoken.length - 1]?.rate).toBe(0.25);
  });

  it("setPitch() clamps", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    controller.setPitch(10);
    expect(synth.spoken[synth.spoken.length - 1]?.pitch).toBe(2);
  });

  it("setVoice() swaps the voice and re-speaks when playing", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    const newVoice = fakeVoice();
    controller.setVoice(newVoice);
    expect(synth.spoken[synth.spoken.length - 1]?.voice).toBe(newVoice);
  });

  it("setUtterances() preserves the index when possible", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    controller.seekTo(2);
    controller.setUtterances([sampleUtterances[0]!, sampleUtterances[1]!]);
    expect(controller.getIndex()).toBe(1);
  });

  it("setUtterances() clamps to the last index when shorter", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    controller.seekTo(2);
    controller.setUtterances([sampleUtterances[0]!]);
    expect(controller.getIndex()).toBe(0);
  });

  it("destroy() cancels and marks the playback stopped", () => {
    const synth = new FakeSynth();
    const controller = createPlayback({ utterances: sampleUtterances, synth });
    controller.play();
    controller.destroy();
    expect(synth.cancelled).toBe(1);
    expect(controller.getPhase()).toBe("stopped");
  });
});