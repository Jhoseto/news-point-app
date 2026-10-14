import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ limit: vi.fn(), speak: vi.fn(), cached: vi.fn() }));
vi.mock("@newspoint/db", async importOriginal => ({
  ...await importOriginal<typeof import("@newspoint/db")>(),
  getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }) }),
}));
vi.mock("@/lib/article-read", () => ({ isArticleReadSameOrigin: () => true }));
vi.mock("@/lib/tts/remote-voice", () => ({ bulgarianSpeech: mocks.speak }));
vi.mock("@/lib/tts/speech-cache", () => ({ hasCachedSpeech: mocks.cached }));
vi.mock("@/lib/tts/utterances", () => ({ articleReadingText: () => "Текст за слушане." }));
vi.mock("@/lib/tts/speech-format", () => import("../../../../../lib/tts/speech-format"));
import { GET } from "./route";

const id = "618a7377-9e0e-4efa-b5b8-4c3688677236";
const row = { id, title: "Заглавие", excerpt: "", body: [{ type: "paragraph", html: "Текст." }], version: 3, listenEnabled: true };
const request = (query = "v=3", site = "same-origin") => new NextRequest(`https://reader.test/api/articles/${id}/speech/?${query}`, { headers: { "sec-fetch-site": site } });
const params = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockReset().mockResolvedValue([row]);
  mocks.cached.mockResolvedValue(true);
  mocks.speak.mockResolvedValue(new Uint8Array([1, 2, 3]));
});
it.each(["", "v=0", "v=-1", "v=3.2", "v=NaN", "v=9007199254740992", "v=3&v=3"])("rejects invalid versions before DB or generation: %s", async query => {
  expect((await GET(request(query), params)).status).toBe(400);
  expect(mocks.limit).not.toHaveBeenCalled();
  expect(mocks.speak).not.toHaveBeenCalled();
});
it("refuses stale published versions without generating audio", async () => {
  const result = await GET(request("v=2"), params);
  expect(result.status).toBe(409);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.speak).not.toHaveBeenCalled();
});
it("serves the current disk-cached version without caching a public response", async () => {
  const result = await GET(request(), params);
  expect(result.status).toBe(200);
  expect(mocks.speak).toHaveBeenCalledWith(`${id}-v3`, "Текст за слушане.", "aac");
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  expect(mocks.limit).toHaveBeenCalledTimes(2);
});
it.each(["format=mp3", "format=opus&format=aac", "format="])("rejects invalid codec requests before generation: %s", async format => {
  expect((await GET(request(`v=3&${format}`), params)).status).toBe(400);
  expect(mocks.speak).not.toHaveBeenCalled();
  expect(mocks.limit).not.toHaveBeenCalled();
});
it("serves the requested Opus profile through the same visibility checks", async () => {
  expect((await GET(request("v=3&format=opus"), params)).status).toBe(200);
  expect(mocks.speak).toHaveBeenCalledWith(`${id}-v3`, "Текст за слушане.", "opus");
  expect(mocks.cached).toHaveBeenCalledWith(`${id}-v3`, "opus");
});
it.each([{ rows: [] }, { rows: [{ ...row, listenEnabled: false }] }])("does not serve unpublished or disabled listening", async ({ rows }) => {
  mocks.limit.mockResolvedValueOnce(rows);
  expect((await GET(request(), params)).status).toBe(404);
  expect(mocks.speak).not.toHaveBeenCalled();
});
it.each([{ rows: [], status: 404 }, { rows: [{ version: 4 }], status: 409 }])("rechecks withdrawal/update during generation: $status", async ({ rows, status }) => {
  mocks.limit.mockResolvedValueOnce([row]).mockResolvedValueOnce(rows);
  const result = await GET(request(), params);
  expect(result.status).toBe(status);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
});
it("rejects cross-site callers even if an audio file exists", async () => {
  expect((await GET(request("v=3", "cross-site"), params)).status).toBe(403);
  expect(mocks.limit).not.toHaveBeenCalled();
});
