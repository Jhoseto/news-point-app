import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
import { acceptsVideoType, inspectVideo, optimizeVideo } from "./uploaded-video";

const exec = promisify(execFile);
const available = await exec("ffmpeg", ["-version"]).then(() => true, () => false);
describe.skipIf(!available)("uploaded video processing", () => {
  let folder: string;
  beforeAll(async () => { folder = await mkdtemp(join(tmpdir(), "np-video-test-")); });
  afterAll(async () => { if (folder) await rm(folder, { recursive: true, force: true }); });

  it("normalizes a short clip to a browser MP4 without upscaling", async () => {
    const source = join(folder, "source.mp4");
    const output = join(folder, "output.mp4");
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=10", "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-y", source]);
    const result = await optimizeVideo(source, output);
    expect(result.duration).toBeCloseTo(2, 0);
    expect([result.width, result.height]).toEqual([320, 240]);
    expect(result.bytes).toBe((await stat(output)).size);
  });

  it("rejects clips over five minutes before transcoding", async () => {
    const source = join(folder, "too-long.mp4");
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:r=1", "-t", "301", "-c:v", "libx264", "-preset", "ultrafast", "-y", source]);
    await expect(inspectVideo(source)).rejects.toThrow("до 5 минути");
    await expect(optimizeVideo(source, join(folder, "not-created.mp4"))).rejects.toThrow("до 5 минути");
  });

  it("accepts only the supported input media types", () => {
    expect(acceptsVideoType("video/quicktime")).toBe(true);
    expect(acceptsVideoType("image/png")).toBe(false);
  });
});
