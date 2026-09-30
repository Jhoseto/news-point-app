import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareUploadedPhoto } from "./uploaded-photo";

describe("uploaded photo", () => {
  it("matches the news upload: rotated WebP, no enlargement past 4096, no EXIF", async () => {
    const input = await sharp({ create: { width: 5000, height: 2000, channels: 3, background: "#2255aa" } }).withMetadata().jpeg().toBuffer();
    const output = await prepareUploadedPhoto(input);
    const metadata = await sharp(output.buffer).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(4096);
    expect(metadata.height).toBe(1638);
    expect(metadata.exif).toBeUndefined();
    expect(output.width).toBe(4096);
    expect(output.height).toBe(2000);
  });
});
