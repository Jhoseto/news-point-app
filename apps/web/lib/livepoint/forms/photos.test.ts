import { expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { MAX_PHOTO_BYTES, photoSelectionError, submissionFormData } from "./photos";
import { preparePhotos } from "./photo-processing";
import { readSubmission, reserveSubmission } from "./submission-request";

const photo = (size = 10, type = "image/jpeg", name = "photo.jpg") => ({ size, type, name });
it("accepts exactly 5 photos and exactly 10 MiB each, rejects a sixth or extra byte", () => {
  expect(photoSelectionError(Array.from({ length: 5 }, () => photo(MAX_PHOTO_BYTES)))).toBeNull();
  expect(photoSelectionError(Array.from({ length: 6 }, () => photo()))).not.toBeNull();
  expect(photoSelectionError([photo(MAX_PHOTO_BYTES + 1)])).not.toBeNull();
  expect(photoSelectionError([photo(0)])).not.toBeNull();
});
it.each([["image/svg+xml", "image.svg"], ["application/pdf", "photo.jpg"], ["image/jpeg", "file.jpg.exe"], ["image/gif", "image.gif"]])("rejects unwanted MIME/extension %s %s", (type, name) => {
  expect(photoSelectionError([photo(10, type, name)])).not.toBeNull();
});
it.each(["jpeg", "png", "webp"] as const)("decodes and re-encodes genuine %s, stripping metadata and appended content", async format => {
  const image = await sharp({ create: { width: 32, height: 24, channels: 3, background: "red" } }).withMetadata().toFormat(format).toBuffer();
  const bytes = Buffer.concat([image, Buffer.from("<script>unwanted()</script>")]);
  const result = (await preparePhotos([new File([bytes], `image.${format === "jpeg" ? "jpg" : format}`, { type: `image/${format}` })]))[0]!;
  const metadata = await sharp(result.buffer).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.exif).toBeUndefined();
  expect(result.buffer.includes(Buffer.from("<script>"))).toBe(false);
  expect([result.width, result.height]).toEqual([32, 24]);
});
it("rejects disguised SVG/executable and malformed JPEG before storage", async () => {
  await expect(preparePhotos([new File(["<svg onload='alert(1)'/>"], "photo.jpg", { type: "image/jpeg" })])).rejects.toThrow("съответства");
  await expect(preparePhotos([new File([new Uint8Array([255,216,255,0])], "photo.jpg", { type: "image/jpeg" })])).rejects.toThrow("повредена");
});
it("rejects MIME mismatch and animated PNG", async () => {
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  await expect(preparePhotos([new File([image], "photo.jpg", { type: "image/jpeg" })])).rejects.toThrow("съответства");
  const animationChunk = Buffer.alloc(20);
  animationChunk.writeUInt32BE(8, 0); animationChunk.write("acTL", 4);
  const animated = Buffer.concat([image.subarray(0, 33), animationChunk, image.subarray(33)]);
  await expect(preparePhotos([new File([animated], "photo.png", { type: "image/png" })])).rejects.toThrow("анимирана");
});
it("rejects oversized pixel dimensions without decoding them", async () => {
  const image = await sharp({ create: { width: 8000, height: 7000, channels: 3, background: "white" } }).png().toBuffer();
  await expect(preparePhotos([new File([image], "photo.png", { type: "image/png" })])).rejects.toThrow("50 мегапиксела");
});
it("allows five attempts then rate limits this client", () => {
  const request = () => new Request("http://localhost/api", { method: "POST", headers: { origin: "http://localhost", "x-forwarded-for": "test-rate-limit" } });
  for (let i = 0; i < 5; i++) reserveSubmission(request())();
  expect(() => reserveSubmission(request())).toThrow("15 минути");
});
it("reads bounded multipart metadata and rejects unexpected fields or six files", async () => {
  const file = new File(["test"], "photo.jpg", { type: "image/jpeg" });
  const form = submissionFormData({ title: "test" }, [file]);
  const request = () => new Request("http://localhost/api", { method: "POST", body: form });
  expect((await readSubmission(request())).photos).toHaveLength(1);
  form.append("evil", file);
  await expect(readSubmission(request())).rejects.toThrow("Невалидни");
  await expect(readSubmission(new Request("http://localhost/api", { method: "POST", body: submissionFormData({}, Array(6).fill(file)) }))).rejects.toThrow("5 снимки");
});
it("enforces actual streamed bytes even when Content-Length is absent", async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65 * 1024)); controller.close(); } });
  const request = new Request("http://localhost/api", { method: "POST", body, headers: { "Content-Type": "application/json" }, duplex: "half" } as RequestInit);
  await expect(readSubmission(request)).rejects.toMatchObject({ status: 413 });
});
it("rejects cross-origin submissions and bounds concurrent work", () => {
  const request = (origin: string) => new Request("http://localhost/api", { method: "POST", headers: { origin, "x-forwarded-for": "test-concurrency" } });
  expect(() => reserveSubmission(request("https://evil.test"))).toThrow("от сайта");
  const a = reserveSubmission(request("http://localhost"));
  const b = reserveSubmission(request("http://localhost"));
  try { expect(() => reserveSubmission(request("http://localhost"))).toThrow("други снимки"); }
  finally { a(); b(); }
});
