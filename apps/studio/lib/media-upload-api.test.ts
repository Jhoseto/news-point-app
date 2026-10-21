import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), create: vi.fn(), status: vi.fn(), chunk: vi.fn(), complete: vi.fn(), cancel: vi.fn(), audit: vi.fn() }));
vi.mock("@newspoint/db", () => ({ getDb: () => ({ fixture: true }) }));
vi.mock("./session", () => ({ staffFromRequest: mocks.staff }));
vi.mock("./auth", () => ({ studioOrigins: () => ({ trusted: ["https://studio.test"] }) }));
vi.mock("./audit-context", () => ({ auditFacts: mocks.audit }));
vi.mock("@newspoint/db/media-uploads", async importOriginal => ({ ...await importOriginal<typeof import("@newspoint/db/media-uploads")>(), createMediaUpload: mocks.create, mediaUploadStatus: mocks.status, putMediaChunk: mocks.chunk, completeMediaUpload: mocks.complete, cancelMediaUpload: mocks.cancel }));
import { boundedBody, mediaUploadAPI } from "./media-upload-api";
const id = "360a3346-fae0-43c2-991a-dc73728ca9c9";
function request(method: string, body?: string, headers: Record<string, string> = {}) { return new Request("https://studio.test/admin/api/uploads/", { method, headers: { origin: "https://studio.test", ...headers }, ...(body != null ? { body } : {}) }); }
beforeEach(() => { for (const fn of Object.values(mocks)) fn.mockReset(); mocks.staff.mockResolvedValue({ id: "editor", role: "editor" }); mocks.complete.mockResolvedValue({ ok: true, state: "queued" }); mocks.chunk.mockResolvedValue({ ok: true }); mocks.status.mockResolvedValue({ id, state: "uploading" }); mocks.cancel.mockResolvedValue({ ok: true }); });
afterEach(() => vi.useRealTimers());
it("denies foreign origins, anonymous users and nonstaff before reading a body", async () => {
 const input = request("POST", "unread", { origin: "https://foreign.test" }); const reader = vi.spyOn(input, "json"); expect((await mediaUploadAPI(input)).status).toBe(403); expect(reader).not.toHaveBeenCalled(); expect(mocks.staff).not.toHaveBeenCalled();
 mocks.staff.mockResolvedValue(null); expect((await mediaUploadAPI(request("POST", "unread"))).status).toBe(401);
 mocks.staff.mockResolvedValue({ id: "reader", role: "reader" }); expect((await mediaUploadAPI(request("POST", "unread"))).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled();
});
it("status and complete bind the authenticated owner and avoid public caching", async () => {
 const response = await mediaUploadAPI(request("GET"), [id]); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(mocks.status).toHaveBeenCalledWith(expect.anything(), "editor", id);
 expect((await mediaUploadAPI(request("POST"), [id,"complete"])).status).toBe(202); expect(mocks.complete).toHaveBeenCalledWith(expect.anything(), "editor", id);
});
it("accepted chunk route uses stable fileId and exact SHA header and raw bytes", async () => {
 const response = await mediaUploadAPI(request("PUT", "chunk", { "x-chunk-sha256": "a".repeat(64), "content-type": "application/octet-stream" }), [id,"files","video","chunks","0"]);
 expect(response.status).toBe(200); expect(mocks.chunk).toHaveBeenCalledWith(expect.anything(), "editor", id, "video", 0, "a".repeat(64), Buffer.from("chunk"));
});
it("POST chunks preserve raw bytes, checksum and owner; POST cancel uses the same owner boundary", async () => {
 const parts = [id,"files","video","chunks","0"];
 const response = await mediaUploadAPI(request("POST", "chunk", { "x-chunk-sha256": "a".repeat(64), "content-type": "application/octet-stream" }), parts);
 expect(response.status).toBe(200); expect(mocks.chunk).toHaveBeenCalledWith(expect.anything(), "editor", id, "video", 0, "a".repeat(64), Buffer.from("chunk"));
 expect((await mediaUploadAPI(request("POST"), [id,"cancel"])).status).toBe(200); expect(mocks.cancel).toHaveBeenCalledWith(expect.anything(), "editor", id);
});
it("POST chunks and cancel reject anonymous users and foreign origins before writing", async () => {
 for (const parts of [[id,"files","video","chunks","0"],[id,"cancel"]]) {
  expect((await mediaUploadAPI(request("POST", "unread", { origin: "https://foreign.test" }), parts)).status).toBe(403);
  mocks.staff.mockResolvedValue(null); expect((await mediaUploadAPI(request("POST", "unread"), parts)).status).toBe(401); mocks.staff.mockResolvedValue({ id: "editor", role: "editor" });
 }
 expect(mocks.chunk).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled();
});
it("POST chunks preserve the size limit and reject invalid indexes", async () => {
 expect((await mediaUploadAPI(request("POST", "x", { "content-length": String(4 * 1024 ** 2 + 1) }), [id,"files","video","chunks","0"])).status).toBe(413);
 expect((await mediaUploadAPI(request("POST", "x"), [id,"files","video","chunks","NaN"])).status).toBe(400); expect(mocks.chunk).not.toHaveBeenCalled();
});
it("oversized declared and streamed chunks are rejected before the DB chunk writer", async () => {
 expect((await mediaUploadAPI(request("PUT", "x", { "content-length": String(4 * 1024 ** 2 + 1) }), [id,"files","video","chunks","0"])).status).toBe(413);
 expect((await mediaUploadAPI(request("PUT", "x".repeat(4 * 1024 ** 2 + 1)), [id,"files","video","chunks","0"])).status).toBe(413); expect(mocks.chunk).not.toHaveBeenCalled();
});
it("malformed intent and invalid route indexes never reach persistence", async () => {
 expect((await mediaUploadAPI(request("POST", "not-json"))).status).toBe(400);
 expect((await mediaUploadAPI(request("POST", JSON.stringify({ kind: "podcast", files: [], metadata: {} })))).status).toBe(400);
 expect((await mediaUploadAPI(request("PUT", "x"), [id,"files","video","chunks","NaN"])).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.chunk).not.toHaveBeenCalled();
});
it("stalled body deadline cancels reader with a recoverable408", async () => {
 vi.useFakeTimers(); const cancelled = vi.fn(); const input = new Request("https://studio.test/admin/api/uploads/", { method: "PUT", body: new ReadableStream({ cancel: cancelled }), duplex: "half" } as RequestInit);
 const pending = boundedBody(input, 4 * 1024 ** 2).catch(error => error); await vi.advanceTimersByTimeAsync(90_000); expect(await pending).toMatchObject({ status: 408, code: "upload_timeout" }); expect(cancelled).toHaveBeenCalledOnce();
});
it("mismatched content-length rejects interrupted bytes rather than storing them", async () => { await expect(boundedBody(request("PUT", "x", { "content-length": "2" }), 100)).rejects.toMatchObject({ code: "body_size", status: 400 }); });
