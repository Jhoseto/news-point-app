import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderPodcastTikTok } from "./podcast-tiktok-render";

const run = promisify(execFile);
const binary = process.env.FFMPEG_PATH || "ffmpeg";
const probe = process.env.FFPROBE_PATH || "ffprobe";
const available = await Promise.all([binary, probe].map(file => run(file, ["-version"], { windowsHide: true }))).then(() => true, () => false);

describe.skipIf(!available)("podcast TikTok video", () => {
  let directory: string;
  let coverPath: string;
  let audioPath: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "np-podcast-export-"));
    coverPath = join(directory, "cover.webp");
    audioPath = join(directory, "sound.m4a");
    await sharp({ create: { width: 300, height: 300, channels: 3, background: "#262d49" } }).webp().toFile(coverPath);
    // A low note, digital silence, a high note and a 12 kHz treble note. No peaks
    // can move rightwards at these timestamps unless they follow the signal.
    const signal = "aevalsrc=0.32*sin(2*PI*180*t)*lt(t\\,1.4)+0.32*sin(2*PI*2600*t)*between(t\\,2.5\\,3.9)+0.32*sin(2*PI*12000*t)*gt(t\\,4.3):s=48000:d=5";
    await run(binary, ["-v", "error", "-f", "lavfi", "-i", signal, "-c:a", "aac", audioPath], { windowsHide: true });
  });
  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  it("encodes both full-length tracks and moves the spectrum with the audio frequencies", async () => {
    const outputPath = join(directory, "export.mp4");
    const progress: number[] = [];
    await renderPodcastTikTok({ audioPath, coverPath, outputPath, signal: AbortSignal.timeout(60_000), onProgress: percent => progress.push(percent) });
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBeGreaterThan(90);
    expect(progress).toEqual([...new Set(progress)].sort((a, b) => a - b));
    expect(progress.every(percent => Number.isInteger(percent) && percent < 100)).toBe(true);
    const { stdout } = await run(probe, ["-v", "error", "-show_entries", "stream=codec_name,width,height,pix_fmt,r_frame_rate,duration", "-of", "json", outputPath], { windowsHide: true });
    const tracks = JSON.parse(stdout).streams as Array<{ duration: string }>;
    expect(tracks[0]).toMatchObject({ codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1", pix_fmt: "yuv420p" });
    expect(tracks[1]).toMatchObject({ codec_name: "aac" });
    for (const track of tracks) expect(Math.abs(Number(track.duration) - 5)).toBeLessThan(0.1);

    async function spectrumAt(seconds: number) {
      const frame = await run(binary, ["-v", "error", "-ss", String(seconds), "-i", outputPath, "-frames:v", "1", "-vf", "crop=704:144:188:1352", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer", windowsHide: true });
      let total = 0;
      let positions = 0;
      for (let i = 0; i < frame.stdout.length; i += 3) {
        if (frame.stdout[i]! < 140 || frame.stdout[i + 2]! < 170) continue;
        total++;
        positions += (i / 3) % 704;
      }
      return { total, center: positions / total };
    }
    const [low, silence, high, treble] = await Promise.all([0.8, 2, 3.3, 4.75].map(spectrumAt));
    expect(low!.total).toBeGreaterThan(300);
    expect(high!.total).toBeGreaterThan(300);
    expect(treble!.total).toBeGreaterThan(300);
    expect(silence!.total).toBeLessThan(20);
    expect(high!.center).toBeGreaterThan(low!.center + 120);
    expect(treble!.center).toBeGreaterThan(high!.center + 150);
  }, 60_000);

  it("measures a headerless VBR MP3 from decoded samples when its duration estimate is wrong", async () => {
    const input = join(directory, "legacy.mp3");
    const outputPath = join(directory, "legacy.mp4");
    await run(binary, [
      "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=3", "-f", "lavfi", "-i", "anoisesrc=d=3:r=48000:seed=7",
      "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[a]", "-map", "[a]", "-c:a", "libmp3lame", "-q:a", "1", "-write_xing", "0", input,
    ], { windowsHide: true });
    await renderPodcastTikTok({ coverPath, audioPath: input, outputPath, signal: AbortSignal.timeout(60_000), onProgress() {} });
    const { stdout } = await run(probe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", outputPath], { windowsHide: true });
    expect(Math.abs(Number(stdout.trim()) - 6)).toBeLessThan(0.1);
  }, 60_000);

  it("removes an interrupted render and keeps an existing file intact", async () => {
    const outputPath = join(directory, "interrupted.mp4");
    const controller = new AbortController();
    await expect(renderPodcastTikTok({ coverPath, audioPath, outputPath, signal: controller.signal, onProgress: percent => { if (percent > 0) controller.abort(); } })).rejects.toThrow();
    await expect(stat(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(outputPath, "existing");
    await expect(renderPodcastTikTok({ coverPath, audioPath, outputPath, signal: AbortSignal.timeout(60_000), onProgress() {} })).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(outputPath, "utf8")).toBe("existing");
  }, 60_000);
});
