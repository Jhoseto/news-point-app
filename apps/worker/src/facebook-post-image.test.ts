import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderFacebookPostImage } from "./facebook-post-image";

describe("Facebook image artwork", () => {
  it.each([[1600, 600], [600, 1600], [64, 48]])("makes a bounded branded JPEG from a %sx%s source", async (width, height) => {
    const source = await sharp({ create: { width, height, channels: 3, background: "#e4eafa" } }).png().toBuffer();
    const copy = Buffer.from(source);
    const result = await renderFacebookPostImage(source, "Тестово заглавие: Пловдив, България и светът");
    expect(await sharp(result).metadata()).toMatchObject({ format: "jpeg", width: 1200, height: 900 });
    expect(result.length).toBeLessThan(4 * 1024 * 1024);
    expect(source).toEqual(copy);
    // The fixed footer has real wordmark pixels on the left and link-label pixels on the right.
    const left = await sharp(result).extract({ left: 52, top: 800, width: 260, height: 74 }).stats();
    const right = await sharp(result).extract({ left: 850, top: 812, width: 282, height: 58 }).stats();
    expect(Math.max(...left.channels.map(c => c.stdev))).toBeGreaterThan(30);
    expect(Math.max(...right.channels.map(c => c.stdev))).toBeGreaterThan(30);
  });
  it("fits a full-length Cyrillic headline and treats markup and controls as plain text", async () => {
    const source = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "white" } }).png().toBuffer();
    const title = ('Тестова дълга новина за Пловдив и България: нови зелени площи, ремонти и промени в движението. ').repeat(3).slice(0, 200);
    const long = await renderFacebookPostImage(source, title);
    expect(await sharp(long).metadata()).toMatchObject({ width: 1200, height: 900 });
    const text = await renderFacebookPostImage(source, 'Тест <span foreground="red"> & "кавычки"\u0000 текст');
    expect(text.equals(long)).toBe(false);
    await expect(renderFacebookPostImage(source, " \n\t ")).rejects.toThrow("invalid_social_headline");
  });
});
