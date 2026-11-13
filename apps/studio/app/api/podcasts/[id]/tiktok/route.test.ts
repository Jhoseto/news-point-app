import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ staff: vi.fn(), episode: vi.fn(), render: vi.fn() }));
vi.mock("../../../../../lib/session", () => ({ staffFromRequest: mocks.staff }));
vi.mock("../../../../../lib/auth", () => ({ studioOrigins: () => ({ trusted: ["https://studio.test"] }) }));
vi.mock("@newspoint/db/podcasts", () => ({ podcastForStaff: mocks.episode }));
vi.mock("../../../../../lib/podcast-tiktok-render", () => ({ renderPodcastTikTok: mocks.render }));

import { GET, POST } from "./route";
import { auditDescriptor } from "../../../../../lib/audit-metadata";

const id = "618a7377-9e0e-4efa-b5b8-4c3688677236";
const origin = "https://studio.test";
const base = `${origin}/admin/api/podcasts/${id}/tiktok/`;
const context = (episodeId = id) => ({ params: Promise.resolve({ id: episodeId }) });
const episode = { id, slug: "fixture-episode", revision: 1, coverKey: "podcasts/2026/11/ee.webp", audioKey: "podcasts/2026/11/ee.m4a", durationSec: 1, status: "draft" };
const request = (body: unknown = { revision: 1 }, source = origin) => new Request(base, { method: "POST", headers: { origin: source, "content-type": "application/json" }, body: JSON.stringify(body) });
const read = (job: string, options = "", headers?: Record<string, string>) => GET(new Request(`${base}?job=${job}${options}`, { headers: headers ?? {} }), context());
let stage: string;

beforeAll(async () => {
  stage = await mkdtemp(join(tmpdir(), "np-tiktok-route-test-"));
  vi.stubEnv("MEDIA_ROOT", join(stage, "media"));
  vi.stubEnv("MEDIA_UPLOAD_TEMP_ROOT", join(stage, "private"));
  vi.stubEnv("MEDIA_SSH_TARGET", "");
  const folder = join(stage, "media", "podcasts", "2026", "11");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "ee.m4a"), "fixture audio");
  await writeFile(join(folder, "ee.webp"), "fixture cover");
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockResolvedValue({ id: "fixture-editor", role: "editor" });
  mocks.episode.mockResolvedValue(episode);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(stage, { recursive: true, force: true });
});

it("checks origin, editor, input and revision before starting any work", async () => {
  expect((await POST(request(undefined, "https://foreign.test"), context())).status).toBe(403);
  mocks.staff.mockResolvedValue(null);
  expect((await POST(request(), context())).status).toBe(401);
  expect((await read(id)).status).toBe(401);
  mocks.staff.mockResolvedValue({ id: "reader", role: "reader" });
  expect((await POST(request(), context())).status).toBe(403);
  expect((await read(id, "&download=1")).status).toBe(403);
  mocks.staff.mockResolvedValue({ id: "fixture-editor", role: "admin" });
  expect((await POST(request({ revision: 1, coverKey: "/fixture" }), context())).status).toBe(400);
  expect((await POST(request(), context("invalid"))).status).toBe(404);
  expect((await POST(request({ revision: 2 }), context())).status).toBe(409);
  mocks.episode.mockResolvedValue({ ...episode, audioKey: "https://foreign.test/recording.mp3" });
  expect((await POST(request(), context())).status).toBe(422);
  mocks.episode.mockResolvedValue(null);
  expect((await POST(request(), context())).status).toBe(404);
  expect(mocks.render).not.toHaveBeenCalled();
});

it("prevents duplicate renders and serves only the owner's finished attachment, including resumed downloads", async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  mocks.render.mockImplementationOnce(async ({ audioPath, coverPath, onProgress, outputPath }) => {
    expect(await readFile(audioPath, "utf8")).toBe("fixture audio");
    expect(await readFile(coverPath, "utf8")).toBe("fixture cover");
    onProgress(28); onProgress(4);
    await pending;
    await writeFile(outputPath, "fixture video");
  });
  const [one, two] = await Promise.all([POST(request(), context()), POST(request(), context())]);
  const job = (await one.json()).jobId;
  expect(one.status).toBe(202);
  expect((await two.json()).jobId).toBe(job);
  await vi.waitFor(async () => expect(await (await read(job)).json()).toMatchObject({ state: "rendering", percent: 28 }));
  expect((await read(job, "&download=1")).status).toBe(409);
  mocks.staff.mockResolvedValue({ id: "second-editor", role: "editor" });
  expect((await POST(request(), context())).status).toBe(409);
  expect((await read(job)).status).toBe(404);
  expect((await read(job, "&download=1")).status).toBe(404);
  mocks.staff.mockResolvedValue({ id: "fixture-editor", role: "editor" });
  expect((await GET(new Request(`${base}?job=${job}`), context("618a7377-9e0e-4efa-b5b8-4c3688677237"))).status).toBe(404);
  finish();
  await vi.waitFor(async () => expect(await (await read(job)).json()).toMatchObject({ state: "ready", percent: 100 }));
  const download = await read(job, "&download=1");
  expect(download.status).toBe(200);
  expect(download.headers.get("content-type")).toBe("video/mp4");
  expect(download.headers.get("content-disposition")).toBe('attachment; filename="fixture-episode-tiktok.mp4"');
  expect(download.headers.get("cache-control")).toBe("private, no-store");
  expect(await download.text()).toBe("fixture video");
  const part = await read(job, "&download=1", { range: "bytes=1-3" });
  expect(part.status).toBe(206);
  expect(part.headers.get("content-range")).toBe("bytes 1-3/13");
  expect(await part.text()).toBe("ixt");
  expect((await read(job, "&download=1", { range: "bytes=100-101" })).status).toBe(416);
  expect(mocks.render).toHaveBeenCalledTimes(1);
  expect(auditDescriptor(new URL(base).pathname, "POST", {})).toMatchObject({ action: "podcasts.exportTikTok", entityId: id });
  expect(auditDescriptor(new URL(base).pathname, "GET", { download: "1" })).toMatchObject({ action: "podcasts.downloadTikTok", entityId: id });
});

it("redacts render errors, removes partial output and allows retry for the same revision", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.episode.mockResolvedValue({ ...episode, revision: 2 });
  let output = "";
  mocks.render.mockImplementationOnce(async ({ outputPath }) => {
    output = outputPath;
    await writeFile(output, "partial data");
    throw new Error("private fixture diagnostic");
  }).mockImplementationOnce(async ({ outputPath }) => { await writeFile(outputPath, "complete fixture"); });
  const start = async () => (await (await POST(request({ revision: 2 }), context())).json()).jobId as string;
  const job = await start();
  await vi.waitFor(async () => expect((await (await read(job)).json()).state).toBe("failed"));
  expect(await (await read(job)).text()).not.toContain("private fixture diagnostic");
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  const retry = await start();
  expect(retry).not.toBe(job);
  await vi.waitFor(async () => expect((await (await read(retry)).json()).state).toBe("ready"));
});
