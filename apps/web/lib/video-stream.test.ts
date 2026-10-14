import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("./media-disk", () => ({ mediaFile: () => filePath }));
vi.mock("@newspoint/content/disk", () => ({ remoteDiskFromEnv: () => null, remoteFileSize: vi.fn(), openRemoteRange: vi.fn() }));

import { videoResponse } from "./video-stream";

let folder: string;
let filePath: string;
const key = "news/2026/10/00000000-0000-4000-8000-000000000001.mp4";

describe("video range delivery", () => {
  beforeAll(async () => { folder = await mkdtemp(join(tmpdir(), "np-video-range-")); filePath = join(folder, "clip.mp4"); await writeFile(filePath, Buffer.from("0123456789")); });
  afterAll(async () => { if (folder) await rm(folder, { recursive: true, force: true }); });

  it("streams the requested byte range with seekable MP4 headers", async () => {
    const response = await videoResponse(key, "bytes=2-5");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(await response.text()).toBe("2345");
  });

  it("rejects invalid ranges and non-video storage keys", async () => {
    expect((await videoResponse(key, "bytes=20-30")).status).toBe(416);
    expect((await videoResponse("news/2026/10/../../secret.mp4", null)).status).toBe(404);
  });
});
