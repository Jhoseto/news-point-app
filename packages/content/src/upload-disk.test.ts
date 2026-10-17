import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { mediaFile, writeMediaFile, writeMediaFromFile } from "./upload-disk";
let root: string;
beforeEach(async () => { root = await mkdtemp(resolve(tmpdir(), "np-atomic-media-")); await mkdir(resolve(root, "media")); await mkdir(resolve(root, "attempt")); vi.stubEnv("MEDIA_ROOT", resolve(root, "media")); vi.stubEnv("MEDIA_SSH_TARGET", ""); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
it("atomically publishes prepared bytes with no staging remains in the private attempt", async () => {
 const bytes = Buffer.from("explicit fixture image"); await writeMediaFile("podcasts/2026/10/fixture.webp", bytes, resolve(root, "attempt")); expect(await readFile(mediaFile("podcasts/2026/10/fixture.webp")!)).toEqual(bytes); expect(await readdir(resolve(root, "attempt"))).toEqual([]);
});
it("atomically copies an optimized file and cleans private staging after a failed source read", async () => {
 const source = resolve(root, "attempt", "optimized.mp4"); await writeFile(source, "fixture movie"); await writeMediaFromFile("news/2026/10/fixture.mp4", source, resolve(root, "attempt")); expect((await readFile(mediaFile("news/2026/10/fixture.mp4")!)).toString()).toBe("fixture movie");
 await expect(writeMediaFromFile("news/2026/10/failed.mp4", resolve(root, "missing"), resolve(root, "attempt"))).rejects.toThrow(); await expect(readFile(mediaFile("news/2026/10/failed.mp4")!)).rejects.toMatchObject({ code: "ENOENT" }); expect(await readdir(resolve(root, "attempt"))).toEqual(["optimized.mp4"]);
});
it.each(["news/../private", "news/2026/10/..\\private", "news/2026/10/a\u0000b", "news/2026/10/a\u001fb", "news/2026/10/a\u007fb", "untrusted/secret"])("rejects nonportable or out-of-prefix storage key %s", key => { expect(mediaFile(key)).toBeNull(); });
