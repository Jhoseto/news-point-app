import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { aiStorageKey, assertAudioTools, brandedCover, loadMedia, masterAudio, saveMedia } from "./ai-media";

function wav(seconds: number) {
  const frames = seconds * 24_000;
  const pcm = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 24_000) * 1800), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24); header.writeUInt32LE(48_000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

describe("AI podcast mastering", () => {
  it("places the real NewsPoint logo and Bulgarian title on a square cover", async () => {
    const background = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#153d79" } }).png().toBuffer();
    const result = await brandedCover(background, "Новините от Пловдив днес");
    expect(await sharp(result).metadata()).toMatchObject({ width: 1200, height: 1200, format: "webp" });
    if (process.env.AI_STUDIO_COVER_PREVIEW === "1") {
      const output = join(process.cwd(), "tests", "reports", "ai-studio", "cover-preview.webp");
      await writeFile(output, result);
    }
  });
  it.skipIf(!process.env.FFMPEG_PATH || !process.env.FFPROBE_PATH)("checks required encoders before generating paid speech", async () => {
    await expect(assertAudioTools()).resolves.toBeUndefined();
  });
  it("round-trips a private AI asset under the configured media root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "np-ai-storage-"));
    const oldRoot = process.env.MEDIA_ROOT;
    const oldTarget = process.env.MEDIA_SSH_TARGET;
    const oldKey = process.env.MEDIA_SSH_KEY;
    try {
      process.env.MEDIA_ROOT = dir;
      delete process.env.MEDIA_SSH_TARGET;
      delete process.env.MEDIA_SSH_KEY;
      const key = aiStorageKey("wav");
      await saveMedia(key, Buffer.from("RIFF test"));
      expect(await loadMedia(key)).toEqual(Buffer.from("RIFF test"));
    } finally {
      if (oldRoot === undefined) delete process.env.MEDIA_ROOT; else process.env.MEDIA_ROOT = oldRoot;
      if (oldTarget === undefined) delete process.env.MEDIA_SSH_TARGET; else process.env.MEDIA_SSH_TARGET = oldTarget;
      if (oldKey === undefined) delete process.env.MEDIA_SSH_KEY; else process.env.MEDIA_SSH_KEY = oldKey;
      await rm(dir, { recursive: true, force: true });
    }
  });
  it.skipIf(!process.env.FFMPEG_PATH || !process.env.FFPROBE_PATH)("stitches WAV segments into a playable MP3", async () => {
    const result = await masterAudio([wav(1), wav(1)], null);
    expect(result.durationSec).toBeGreaterThanOrEqual(2);
    expect(result.bytes.length).toBeGreaterThan(1000);
    expect(result.bytes.toString("ascii", 0, 3)).toBe("ID3");
  });
  it.skipIf(!process.env.FFMPEG_PATH || !process.env.FFPROBE_PATH)("ducks a music bed under speech", async () => {
    const dir = await mkdtemp(join(tmpdir(), "np-ai-test-"));
    try {
      const source = join(dir, "music.wav");
      const mp3 = join(dir, "music.mp3");
      await writeFile(source, wav(3));
      await promisify(execFile)(process.env.FFMPEG_PATH!, ["-y", "-loglevel", "error", "-i", source, "-b:a", "128k", mp3]);
      const result = await masterAudio([wav(1), wav(1)], await readFile(mp3));
      expect(result.durationSec).toBeGreaterThanOrEqual(2);
      expect(result.bytes.length).toBeGreaterThan(1000);
      const output = join(dir, "master.mp3");
      await writeFile(output, result.bytes);
      const { stdout } = await promisify(execFile)(process.env.FFPROBE_PATH!, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate", "-of", "json", output]);
      const stream = JSON.parse(stdout).streams[0];
      expect(stream.codec_name).toBe("mp3");
      expect(stream.sample_rate).toBe("48000");
      expect(stream.channels).toBe(2);
      expect(Number(stream.bit_rate)).toBeGreaterThanOrEqual(120_000);
      const { stderr } = await promisify(execFile)(process.env.FFMPEG_PATH!, ["-hide_banner", "-i", output, "-af", "volumedetect", "-f", "null", "-"]);
      const peak = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(stderr)?.[1]);
      expect(peak).toBeLessThanOrEqual(-1.5);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
