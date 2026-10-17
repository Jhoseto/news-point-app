import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cancelResumableUpload, uploadResumable } from "./resumable-upload";
const id = "360a3346-fae0-43c2-991a-dc73728ca9c9";
let values: Map<string, string>;
const file = () => new File(["fixture-video"], "fixture.mp4", { type: "video/mp4" });
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
beforeEach(() => {
 values = new Map(); vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("cancel while hashing sends no create or chunk request", async () => {
 const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
 await expect(uploadResumable("video", [{ key: "video", file: file() }], {}, () => { void cancelResumableUpload("video"); })).rejects.toThrow("отменено");
 expect(fetch).not.toHaveBeenCalled();
});
it("interrupted upload preserves its session and resumes without creating another", async () => {
 let manifest: unknown, metadata: unknown, fail = true, completed = false, creates = 0, chunks = 0;
 vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
  if (options.method === "POST" && url.endsWith("/uploads/")) { const input = JSON.parse(options.body as string); manifest = input.files; metadata = input.metadata; creates++; return json({ id, state: "uploading", manifest, metadata, chunks: [] }, 201); }
  if (options.method === "PUT") { chunks++; if (fail) return json({ error: { message: "interrupted fixture" } }, 400); return json({ ok: true }); }
  if (options.method === "POST") { completed = true; return json({ state: "queued" }, 202); }
  return json({ id, state: completed ? "ready" : "uploading", manifest, metadata, chunks: [], result: { url: "/fixture.mp4" } });
 }));
 await expect(uploadResumable("video", [{ key: "video", file: file() }], {})).rejects.toThrow("interrupted"); expect(values.get("np-upload:video:new")).toBe(id);
 fail = false; expect(await uploadResumable("video", [{ key: "video", file: file() }], {})).toEqual({ url: "/fixture.mp4" }); expect(creates).toBe(1); expect(chunks).toBe(2); expect(values.size).toBe(0);
});
it("retries a transient chunk three times, keeping identical index and checksum", async () => {
 const original = setTimeout; vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => original(fn, ms === 100_000 ? ms : 0)) as typeof setTimeout);
 let attempts = 0; const bodies: string[] = [];
 vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
  if (options.method === "POST" && url.endsWith("/uploads/")) { const input = JSON.parse(options.body as string); return json({ id, state: "uploading", manifest: input.files, metadata: {}, chunks: [] }, 201); }
  if (options.method === "PUT") { attempts++; bodies.push(url + JSON.stringify(options.headers)); if (attempts <= 3) return json({ error: { message: "temporary" } }, 503); return json({ ok: true }); }
  if (options.method === "POST") return json({ state: "queued" }, 202); return json({ state: "ready", result: { url: "/fixture.mp4" } });
 }));
 expect(await uploadResumable("video", [{ key: "video", file: file() }], {})).toEqual({ url: "/fixture.mp4" }); expect(attempts).toBe(4); expect(new Set(bodies).size).toBe(1);
});
it("cancel aborts an in-flight chunk and prevents complete or later requests", async () => {
 let begin!: () => void; const started = new Promise<void>(resolve => { begin = resolve; }); const methods: string[] = [];
 vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
  methods.push(options.method || "GET");
  if (options.method === "POST" && url.endsWith("/uploads/")) { const input = JSON.parse(options.body as string); return json({ id, state: "uploading", manifest: input.files, metadata: {}, chunks: [] }, 201); }
  if (options.method === "PUT") return new Promise<Response>((_, reject) => { begin(); options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true }); });
  return json({ ok: true });
 }));
 const pending = uploadResumable("video", [{ key: "video", file: file() }], {}).catch(error => error as Error); await started; await cancelResumableUpload("video"); expect((await pending).message).toContain("отменено"); expect(methods).toEqual(["POST", "PUT", "DELETE"]); expect(values.size).toBe(0);
});
it("cancel during session creation cancels the acknowledged session before any chunk", async () => {
 let begin!: () => void, finish!: (value: Response) => void; const started = new Promise<void>(resolve => { begin = resolve; }); const methods: string[] = [];
 vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => { methods.push(options.method || "GET"); if (options.method === "POST") return new Promise<Response>(resolve => { finish = resolve; begin(); }); return json({ ok: true }); }));
 const pending = uploadResumable("video", [{ key: "video", file: file() }], {}).catch(error => error as Error); await started; await cancelResumableUpload("video"); finish(json({ id, state: "uploading", chunks: [] }, 201)); expect((await pending).message).toContain("отменено"); expect(methods).toEqual(["POST", "DELETE"]); expect(values.size).toBe(0);
});
it("portable deadline covers a stalled JSON response body", async () => {
 const original = setTimeout; vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => original(fn, ms === 100_000 ? 5 : ms)) as typeof setTimeout);
 vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => new Response(new ReadableStream({ start(controller) { options.signal!.addEventListener("abort", () => controller.error(options.signal!.reason), { once: true }); } }), { headers: { "content-type": "application/json" } })));
 await expect(uploadResumable("video", [{ key: "video", file: file() }], {})).rejects.toThrow("навреме");
});
