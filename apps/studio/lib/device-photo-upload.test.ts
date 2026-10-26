import { afterEach, describe, expect, it, vi } from "vitest";
import { UPLOADED_PHOTO_MAX_BYTES } from "@newspoint/content/upload-photo-limit";
import { acceptedDevicePhotos, uploadDevicePhoto } from "./device-photo-upload";

const file = () => new File(["image"], "photo.png", { type: "image/png" });

afterEach(() => vi.restoreAllMocks());

describe("device photo upload response", () => {
  it("sends a bounded request and returns the saved media asset", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id: "media-1", url: "/media/news/photo.webp" }));
    await expect(uploadDevicePhoto(file(), "News photo")).resolves.toMatchObject({ id: "media-1" });
    expect(timeout).toHaveBeenCalledWith(90_000);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/admin/api/editor/media/upload/");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect((options?.body as FormData).get("alt")).toBe("News photo");
  });

  it("reports a known server rejection without claiming the photo was saved", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { message: "Снимката трябва да е до 25 MB." } }, { status: 413 }));
    await expect(uploadDevicePhoto(file(), "News photo")).rejects.toThrow("Снимката трябва да е до 25 MB.");
  });

  it("rejects an oversized photo before any request, while retaining valid picks", async () => {
    const exact = file();
    const oversized = file();
    Object.defineProperty(exact, "size", { value: UPLOADED_PHOTO_MAX_BYTES });
    Object.defineProperty(oversized, "size", { value: UPLOADED_PHOTO_MAX_BYTES + 1 });
    expect(acceptedDevicePhotos([exact, oversized])).toEqual({ accepted: [exact], rejected: [oversized] });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(uploadDevicePhoto(oversized, "Too large")).rejects.toThrow("Снимката трябва да е до 25 MB.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats interrupted and malformed success responses as uncertain, without retrying", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    await expect(uploadDevicePhoto(file(), "News photo")).rejects.toThrow(/Проверете дали снимката вече е в медийната библиотека/);
    await expect(uploadDevicePhoto(file(), "News photo")).rejects.toThrow(/Проверете дали снимката вече е в медийната библиотека/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
