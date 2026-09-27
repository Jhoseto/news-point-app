import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { uploadPhotos } from "./photo-storage";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://storage.example.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const photo = { buffer: Buffer.from("sanitized fixture"), width: 20, height: 10 };
it("uploads only to a private bucket with generated safe names", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ public: false })).mockResolvedValueOnce(Response.json({ Key: "uploaded" }));
  const result = await uploadPhotos([photo]);
  expect(result[0]).toMatchObject({ bucket: "livepoint-submissions", contentType: "image/webp", width: 20, height: 10 });
  expect(result[0]!.path).toMatch(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/);
  expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "POST", headers: expect.objectContaining({ "x-upsert": "false", "Content-Type": "image/webp" }), cache: "no-store" });
});
it("refuses missing/public buckets before uploading", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ public: true }));
  await expect(uploadPhotos([photo])).rejects.toThrow("private storage");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("cleans up successful and uncertain writes when a later upload fails", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ public: false }))
    .mockResolvedValueOnce(Response.json({ Key: "first" }))
    .mockRejectedValueOnce(new Error("connection dropped after write"))
    .mockResolvedValueOnce(Response.json([]));
  await expect(uploadPhotos([photo, photo])).rejects.toThrow("connection dropped");
  const cleanup = fetchMock.mock.calls[3]![1];
  expect(cleanup.method).toBe("DELETE");
  expect(JSON.parse(cleanup.body).prefixes).toHaveLength(2);
});
