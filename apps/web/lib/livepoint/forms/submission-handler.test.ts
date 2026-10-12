import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), prepare: vi.fn() }));
vi.mock("./photo-storage", () => ({ uploadPhotos: mocks.upload, removePhotos: mocks.remove }));
vi.mock("./photo-processing", () => ({ preparePhotos: mocks.prepare }));
import { handleSubmission } from "./submission-handler";

const files = [{ bucket: "private", path: "safe.webp", contentType: "image/webp" as const, bytes: 10, width: 2, height: 2 }];
let client = 0;
const request = () => new Request("http://localhost/api", { method: "POST", headers: { origin: "http://localhost", "x-forwarded-for": `handler-test-${client++}`, "Content-Type": "application/json" }, body: '{"title":"valid"}' });
beforeEach(() => { vi.clearAllMocks(); mocks.prepare.mockResolvedValue([]); mocks.upload.mockResolvedValue(files); mocks.remove.mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllEnvs());
it("accepts public-origin multipart photo submissions behind the internal proxy", async () => {
  vi.stubEnv("WEB_URL", "https://reader.test");
  const form = new FormData();
  form.set("data", JSON.stringify({ title: "valid" }));
  form.append("photos", new File([new Uint8Array([1, 2])], "photo.jpg", { type: "image/jpeg" }));
  const save = vi.fn().mockResolvedValue({ ok: true, id: "id", reference: "ref" });
  const req = new Request("http://localhost:3100/api/livepoint/report/", { method: "POST", headers: { origin: "https://reader.test", "x-forwarded-for": `handler-test-${client++}` }, body: form });
  const response = await handleSubmission(req, z.object({ title: z.string() }), save);
  expect(response.status).toBe(200);
  expect(mocks.prepare.mock.calls[0]![0][0]).toMatchObject({ name: "photo.jpg", type: "image/jpeg", size: 2 });
  expect(save.mock.calls[0]![0]).toEqual({ title: "valid" });
  expect(save.mock.calls[0]![2]).toEqual(files);
});
it("rejects foreign-origin submissions before parsing photos, uploading or saving", async () => {
  vi.stubEnv("WEB_URL", "https://reader.test");
  const save = vi.fn();
  const req = new Request("http://localhost:3100/api", { method: "POST", headers: { origin: "https://evil.test" }, body: "{}" });
  expect((await handleSubmission(req, z.object({ title: z.string() }), save)).status).toBe(403);
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
it("attaches private metadata to a saved submission and returns no photo URLs", async () => {
  const save = vi.fn().mockResolvedValue({ ok: true, id: "id", reference: "ref" });
  const response = await handleSubmission(request(), z.object({ title: z.string() }), save);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ ok: true, id: "id", reference: "ref" });
  expect(save.mock.calls[0]![2]).toEqual(files);
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("rolls photos back when DB persistence fails", async () => {
  const save = vi.fn().mockResolvedValue({ ok: false, code: "unavailable", error: "DB unavailable" });
  const response = await handleSubmission(request(), z.object({ title: z.string() }), save);
  expect(response.status).toBe(503);
  expect(mocks.remove).toHaveBeenCalledWith(files);
});
it("never saves a submission if photo validation or storage fails", async () => {
  const save = vi.fn();
  mocks.prepare.mockRejectedValueOnce(new Error("invalid photo"));
  expect((await handleSubmission(request(), z.object({ title: z.string() }), save)).status).toBe(400);
  expect(mocks.upload).not.toHaveBeenCalled();
  mocks.upload.mockRejectedValueOnce(new Error("storage unavailable"));
  expect((await handleSubmission(request(), z.object({ title: z.string() }), save)).status).toBe(503);
  expect(save).not.toHaveBeenCalled();
});
