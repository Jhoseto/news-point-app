import { describe, expect, it } from "vitest";
import { PODCAST_WAVE_POINTS, PODCAST_WAVE_FFT_SIZE, podcastWavePaths } from "./podcast-waveform";

function tone(amplitude: number, period = 110) {
  const samples = new Uint8Array(PODCAST_WAVE_FFT_SIZE).fill(128);
  for (let index = 0; index < samples.length; index++) samples[index] = 128 + Math.round(Math.sin(index * 2 * Math.PI / period) * amplitude);
  return samples;
}

describe("podcastWavePaths", () => {
  it("rests as two straight lines for silence and ignores a constant DC offset", () => {
    const history = new Float32Array(PODCAST_WAVE_POINTS * 3);
    const silence = podcastWavePaths(new Uint8Array(PODCAST_WAVE_FFT_SIZE).fill(128), history);
    expect(silence.front).toMatch(/^M0 28\.0/);
    expect(silence.back).toMatch(/^M0 28\.0/);
    expect(silence.strength).toBe(0);
    expect(silence.echoOpacity).toBe(0);
    expect(history.every((value) => value === 0)).toBe(true);
    expect(podcastWavePaths(new Uint8Array(PODCAST_WAVE_FFT_SIZE).fill(172), history).front).toBe(silence.front);
  });

  it("makes the curves respond more strongly to louder audio", () => {
    const silence = podcastWavePaths(tone(0), new Float32Array(PODCAST_WAVE_POINTS * 3));
    const speech = podcastWavePaths(tone(14), new Float32Array(PODCAST_WAVE_POINTS * 3));
    const loud = podcastWavePaths(tone(65), new Float32Array(PODCAST_WAVE_POINTS * 3));
    expect(speech.strength).toBeGreaterThan(silence.strength);
    expect(loud.strength).toBeGreaterThan(speech.strength);
  });

  it("changes its actual shape when the audio sample changes", () => {
    const first = podcastWavePaths(tone(55, 80), new Float32Array(PODCAST_WAVE_POINTS * 3));
    const second = podcastWavePaths(tone(55, 135), new Float32Array(PODCAST_WAVE_POINTS * 3));
    expect(first.front).not.toBe(second.front);
    expect(first.back).not.toBe(second.back);
  });

  it("retains short voice peaks that a window average would cancel", () => {
    const higherPitch = podcastWavePaths(tone(40, 13), new Float32Array(PODCAST_WAVE_POINTS * 3));
    expect(higherPitch.strength).toBeGreaterThan(2);
  });

  it("has no time-driven phase and settles when sound stops", () => {
    const signal = tone(50);
    const baseline = new Float32Array(PODCAST_WAVE_POINTS * 3).fill(0.4);
    expect(podcastWavePaths(signal, baseline.slice()).front).toBe(podcastWavePaths(signal, baseline.slice()).front);
    const history = new Float32Array(PODCAST_WAVE_POINTS * 3);
    podcastWavePaths(signal, history);
    const peak = Math.max(...history.slice(0, PODCAST_WAVE_POINTS).map(Math.abs));
    podcastWavePaths(tone(0), history);
    expect(Math.max(...history.slice(0, PODCAST_WAVE_POINTS).map(Math.abs))).toBeLessThan(peak);
  });

  it("holds recent peaks behind the live line, then fades them away", () => {
    const history = new Float32Array(PODCAST_WAVE_POINTS * 3);
    const loud = podcastWavePaths(tone(70), history, 33);
    const quiet = podcastWavePaths(tone(0), history, 33);
    expect(quiet.strength).toBeLessThan(loud.strength);
    expect(quiet.back).toBe(loud.back);
    expect(quiet.echoOpacity).toBeCloseTo(loud.echoOpacity, 6);
    const fading = podcastWavePaths(tone(0), history, 500);
    expect(fading.echoOpacity).toBeLessThan(quiet.echoOpacity);
    const gone = podcastWavePaths(tone(0), history, 1000);
    expect(gone.echoOpacity).toBe(0);
    expect(gone.back).toBe(podcastWavePaths(tone(0), new Float32Array(PODCAST_WAVE_POINTS * 3)).back);
  });

  it("decays the echo by elapsed time instead of frame count", () => {
    const a = new Float32Array(PODCAST_WAVE_POINTS * 3);
    const b = new Float32Array(PODCAST_WAVE_POINTS * 3);
    podcastWavePaths(tone(65), a);
    podcastWavePaths(tone(65), b);
    for (let frame = 0; frame < 10; frame++) podcastWavePaths(tone(0), a, 33);
    const oneStep = podcastWavePaths(tone(0), b, 330);
    const manySteps = podcastWavePaths(tone(0), a, 0);
    expect(manySteps.echoOpacity).toBeCloseTo(oneStep.echoOpacity, 3);
  });

  it("keeps the smooth traces inside the SVG viewBox", () => {
    const result = podcastWavePaths(tone(127), new Float32Array(PODCAST_WAVE_POINTS * 3));
    for (const path of [result.front, result.back]) {
      const y = [...path.matchAll(/(?:M0|C[\d.]+| [\d.]+) ([\d.]+)/g)].map((match) => Number(match[1]));
      expect(Math.min(...y)).toBeGreaterThanOrEqual(8);
      expect(Math.max(...y)).toBeLessThanOrEqual(48);
    }
  });
});
