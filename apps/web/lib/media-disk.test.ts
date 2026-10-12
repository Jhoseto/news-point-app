import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";

const context = vi.hoisted(() => ({ load: vi.fn(), read: vi.fn(), remoteRead: vi.fn(), remoteWrite: vi.fn(), remoteRemove: vi.fn() }));
vi.mock("@newspoint/db", () => ({ loadRootEnv: context.load }));
vi.mock("node:fs/promises", () => ({ readFile: context.read, mkdir: vi.fn(), writeFile: vi.fn(), rm: vi.fn() }));
vi.mock("@newspoint/content/disk", async importOriginal => ({ ...await importOriginal<typeof import("@newspoint/content/disk")>(), readRemoteFile: context.remoteRead, writeRemoteFile: context.remoteWrite, removeRemoteFile: context.remoteRemove }));
import { mediaFile, readMediaFile, writeMediaFile, removeMediaFile } from "./media-disk";

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("MEDIA_ORIGIN", ""); vi.stubEnv("MEDIA_ROOT", ""); vi.stubEnv("MEDIA_SSH_TARGET", ""); vi.stubEnv("MEDIA_SSH_KEY", "");
  vi.stubEnv("NODE_ENV", "development");
  context.load.mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Media can be the first web request", () => {
  it("never loads live storage credentials into isolated test fixtures", async () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(await readMediaFile("news/2026/10/qa.webp")).toBeNull();
    expect(context.load).not.toHaveBeenCalled(); expect(context.remoteRead).not.toHaveBeenCalled();
  });
  it("loads root settings before reading the public copy, without any page or DB request", async () => {
    context.load.mockImplementation(() => { process.env.MEDIA_ORIGIN = "https://media.example.test"; });
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } })); vi.stubGlobal("fetch", fetch);
    expect(await readMediaFile("news/2026/10/qa.webp")).toEqual(Buffer.from([1, 2, 3]));
    expect(context.load).toHaveBeenCalled(); expect(fetch).toHaveBeenCalledWith("https://media.example.test/media/news/2026/10/qa.webp", expect.objectContaining({ cache: "no-store" }));
    expect(context.remoteRead).not.toHaveBeenCalled();
  });
  it("initializes SSH settings before read, write and removal, and falls back when HTTP is unavailable", async () => {
    context.load.mockImplementation(() => Object.assign(process.env, { MEDIA_ORIGIN: "https://media.example.test", MEDIA_ROOT: "/home/qa/storage", MEDIA_SSH_TARGET: "qa@127.0.0.1", MEDIA_SSH_KEY: "C:/qa/key" }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    context.remoteRead.mockResolvedValue(Buffer.from("QA"));
    const key = "news/2026/10/qa.webp";
    expect(await readMediaFile(key)).toEqual(Buffer.from("QA"));
    await writeMediaFile(key, Buffer.from("QA")); await removeMediaFile(key);
    expect(context.remoteRead).toHaveBeenCalledWith(expect.objectContaining({ root: "/home/qa/storage" }), key, expect.any(Array));
    expect(context.remoteWrite).toHaveBeenCalled(); expect(context.remoteRemove).toHaveBeenCalled();
  });
  it("uses the platform path separator and preserves traversal and prefix protections", () => {
    vi.stubEnv("MEDIA_ROOT", resolve("tests/reports/media-qa-storage"));
    expect(mediaFile("news/2026/10/qa.webp")).toBe(resolve("tests/reports/media-qa-storage/news/2026/10/qa.webp"));
    for (const key of ["news/../secret", "news//photo.webp", "../secret", "other/photo.webp", "news/2026/../../secret", "news/..\\users/profiles/private.webp", "news/2026\\..\\private.webp", "news/qa\u0000.webp"]) expect(mediaFile(key)).toBeNull();
  });
  it("keeps private profile/submission images off the public origin and returns missing files honestly", async () => {
    vi.stubEnv("MEDIA_ORIGIN", "https://media.example.test"); vi.stubEnv("MEDIA_ROOT", resolve("tests/reports/media-qa-storage"));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); context.read.mockRejectedValue(new Error("QA missing"));
    expect(await readMediaFile("users/profiles/qa.webp")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
});
