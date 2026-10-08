import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("./wp-client", () => ({
  fetchOriginBytes: vi.fn(),
}));

import { fetchOriginBytes } from "./wp-client";
import { mirrorNewsImage, storedFilePath } from "./mirror-image";

describe("mirrorNewsImage ladder", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "np-mirror-"));
    process.env.MEDIA_ROOT = root;
    delete process.env.DEV_REMOTE;
    vi.mocked(fetchOriginBytes).mockReset();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  it("writes master + Studio width ladder from the original bytes", async () => {
    const source = await sharp({
      create: { width: 2400, height: 1350, channels: 3, background: "#224466" },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    vi.mocked(fetchOriginBytes).mockResolvedValue(source);

    const url = "https://newspoint.bg/wp-content/uploads/2026/10/sample-hero.jpg";
    const mirrored = await mirrorNewsImage(url, { force: true });
    expect(mirrored).not.toBeNull();
    expect(mirrored!.width).toBe(2400);
    expect(mirrored!.variants.map((entry) => entry.width).sort((a, b) => a - b)).toEqual([
      320, 480, 768, 1024, 1440, 1920,
    ]);
    expect(mirrored!.card.key.endsWith("-card.webp")).toBe(true);

    const masterPath = storedFilePath(mirrored!.key);
    expect(masterPath).toBeTruthy();
    const masterMeta = await sharp(await readFile(masterPath!)).metadata();
    expect(masterMeta.format).toBe("webp");
    expect(masterMeta.width).toBe(2400);

    for (const variant of mirrored!.variants) {
      const path = storedFilePath(variant.key);
      expect(path).toBeTruthy();
      const meta = await sharp(await readFile(path!)).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(variant.width);
    }
  });

  it("does not re-fetch legacy master+card on a normal sync tick", async () => {
    const source = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: "#663322" },
    })
      .jpeg()
      .toBuffer();
    vi.mocked(fetchOriginBytes).mockResolvedValue(source);
    const url = "https://newspoint.bg/wp-content/uploads/2026/10/legacy-once.jpg";
    const first = await mirrorNewsImage(url, { force: true });
    expect(first).not.toBeNull();
    // Simulate legacy disk: remove -w* ladder, keep master + card.
    const { readdir, unlink } = await import("node:fs/promises");
    const dir = join(root, "news", "2026", "10");
    for (const name of await readdir(dir)) {
      if (/-w\d+\.webp$/i.test(name)) await unlink(join(dir, name));
    }
    vi.mocked(fetchOriginBytes).mockClear();
    const second = await mirrorNewsImage(url);
    expect(fetchOriginBytes).not.toHaveBeenCalled();
    expect(second?.variants).toHaveLength(1);
    expect(second?.card.key.endsWith("-card.webp")).toBe(true);
  });
});
