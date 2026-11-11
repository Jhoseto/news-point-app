export const PODCAST_WAVE_POINTS = 40;
export const PODCAST_WAVE_FFT_SIZE = 1024;

const WIDTH = 600;
const MIDLINE = 28;

function smoothPath(values: number[]) {
  const step = WIDTH / (values.length - 1);
  const bound = (value: number) => Math.max(8, Math.min(48, value)).toFixed(1);
  let path = `M0 ${bound(values[0] ?? MIDLINE)}`;
  for (let index = 0; index < values.length - 1; index++) {
    const a = values[index] ?? MIDLINE;
    const b = values[index + 1] ?? MIDLINE;
    const before = values[Math.max(0, index - 1)] ?? MIDLINE;
    const after = values[Math.min(values.length - 1, index + 2)] ?? MIDLINE;
    path += ` C${(index * step + step / 3).toFixed(1)} ${bound(a + (b - before) / 6)}`;
    path += ` ${(index * step + step * 2 / 3).toFixed(1)} ${bound(b - (after - a) / 6)}`;
    path += ` ${((index + 1) * step).toFixed(1)} ${bound(b)}`;
  }
  return path;
}

function softenEcho(values: number[]) {
  return values.map((value, index) => ((values[index - 1] ?? value) + value * 2 + (values[index + 1] ?? value)) / 4);
}

/** Live PCM trace plus a short-lived memory of its strongest recent bends. */
export function podcastWavePaths(samples: Uint8Array, previous: Float32Array, elapsedMs = 33) {
  let center = 128;
  if (samples.length) {
    let sum = 0;
    for (const sample of samples) sum += sample;
    center = sum / samples.length;
  }
  const radius = Math.max(2, Math.floor(samples.length / (PODCAST_WAVE_POINTS * 8)));
  const sampleAt = (fraction: number) => {
    if (!samples.length) return 0;
    const position = Math.round(Math.min(1, fraction) * (samples.length - 1));
    const start = Math.max(0, position - radius);
    const end = Math.min(samples.length, position + radius + 1);
    let peak = 0;
    for (let index = start; index < end; index++) {
      const deviation = (samples[index] ?? center) - center;
      if (Math.abs(deviation) > Math.abs(peak)) peak = deviation;
    }
    return peak;
  };

  const front: number[] = [];
  const back: number[] = [];
  let strength = 0;
  let echoMaximum = 0;
  let echoTotal = 0;
  const delta = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 33;
  for (let index = 0; index < PODCAST_WAVE_POINTS; index++) {
    const fraction = index / (PODCAST_WAVE_POINTS - 1);
    const target = Math.tanh(sampleAt(fraction) / 34) * 18;
    const prior = previous[index] ?? 0;
    const level = prior + (target - prior) * (Math.abs(target) < 0.5 ? 0.38 : 0.78);
    previous[index] = level;
    front.push(MIDLINE + level);
    strength += Math.abs(level);

    const echoIndex = PODCAST_WAVE_POINTS + index;
    const holdIndex = PODCAST_WAVE_POINTS * 2 + index;
    let echo = previous[echoIndex] ?? 0;
    let hold = previous[holdIndex] ?? 0;
    if (Math.abs(target) > 1 && Math.abs(level) >= Math.abs(echo)) {
      echo = level;
      hold = 200;
    } else {
      const decayMs = Math.max(0, delta - hold);
      hold = Math.max(0, hold - delta);
      echo = Math.sign(echo) * Math.max(0, Math.abs(echo) - decayMs * 0.014);
    }
    previous[echoIndex] = echo;
    previous[holdIndex] = hold;
    back.push(MIDLINE + echo);
    echoMaximum = Math.max(echoMaximum, Math.abs(echo));
    echoTotal += Math.abs(echo);
  }
  const echoEnergy = (echoMaximum * 0.7 + echoTotal / PODCAST_WAVE_POINTS * 0.3) / 18;
  return { front: smoothPath(front), back: smoothPath(softenEcho(back)), strength: strength / PODCAST_WAVE_POINTS, echoOpacity: Math.min(0.5, echoEnergy * 0.5) };
}
