import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareProfilePhoto } from "./profile-photo-processing";

describe("profile photo optimization", () => {
  it("normalizes a real image to a square metadata-free WebP", async () => {
    const input = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#6347ff" } }).withMetadata().jpeg().toBuffer();
    const output = await prepareProfilePhoto(new File([input], "portrait.jpg", { type: "image/jpeg" }));
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(metadata.exif).toBeUndefined();
  });

  it("rejects disguised and unsupported files", async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "red" } }).png().toBuffer();
    await expect(prepareProfilePhoto(new File([png], "fake.jpg", { type: "image/jpeg" }))).rejects.toThrow("повредена");
    await expect(prepareProfilePhoto(new File(["<svg/>"] , "x.svg", { type: "image/svg+xml" }))).rejects.toThrow("JPEG");
  });
});
