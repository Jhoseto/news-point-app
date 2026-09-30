export const PODCAST_AUDIO_MAX_BYTES = 80 * 1024 * 1024;

const MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const MPEG1_RATE = [44100, 48000, 32000];
const MPEG2_RATE = [22050, 24000, 16000];

/** Duration of a real MP3. Rejects anything that is not a frame sequence. */
export function inspectMp3(bytes: Buffer): { durationSec: number } | null {
  if (bytes.length < 64 || bytes.length > PODCAST_AUDIO_MAX_BYTES) return null;
  let offset = 0;
  if (bytes.toString("ascii", 0, 3) === "ID3" && bytes.length >= 10) {
    const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f);
    offset = Math.min(bytes.length, 10 + size);
  }
  let samples = 0;
  let frames = 0;
  let sampleRate = 0;
  let skipped = 0;
  while (offset + 4 <= bytes.length && frames < 400_000) {
    const header = bytes.readUInt32BE(offset);
    const parsed = ((header & 0xffe00000) >>> 0) === 0xffe00000 ? frameLength(header) : null;
    if (!parsed || offset + parsed.length > bytes.length) {
      offset += 1;
      skipped += 1;
      if (frames === 0 && skipped > 4096) return null;
      continue;
    }
    samples += parsed.samples;
    sampleRate = parsed.sampleRate;
    frames += 1;
    skipped = 0;
    offset += parsed.length;
  }
  if (frames < 2 || !sampleRate) return null;
  if (offset < bytes.length && frames >= 400_000) samples = Math.round(samples * (bytes.length / offset));
  const durationSec = Math.max(1, Math.round(samples / sampleRate));
  return durationSec <= 21_600 ? { durationSec } : null;
}

function frameLength(header: number): { length: number; samples: number; sampleRate: number } | null {
  const version = (header >>> 19) & 3;
  const layer = (header >>> 17) & 3;
  if (layer !== 1 || version === 1 || version === 0) return null;
  const bitrateIndex = (header >>> 12) & 0xf;
  const rateIndex = (header >>> 10) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const mpeg1 = version === 3;
  const bitrate = (mpeg1 ? MPEG1_L3 : MPEG2_L3)[bitrateIndex] ?? 0;
  const sampleRate = (mpeg1 ? MPEG1_RATE : MPEG2_RATE)[rateIndex] ?? 0;
  if (!bitrate || !sampleRate) return null;
  const samples = mpeg1 ? 1152 : 576;
  const padding = (header >>> 9) & 1;
  const length = Math.floor((samples / 8) * (bitrate * 1000) / sampleRate) + padding;
  return length >= 24 ? { length, samples, sampleRate } : null;
}
