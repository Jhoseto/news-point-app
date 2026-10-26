import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { archiveEventImage, eventImageUrl, normalizeEventTitle, theatreDetailPhoto } from "./event-media";

describe("event photographs", () => {
  it("allows publisher image paths without permitting arbitrary fetch targets", () => {
    expect(eventImageUrl("https://register-dogs.com/shelter/uploads/plovdivd_shelter/11899/DSC03697[1].JPG", "https://dogshelter.plovdiv.bg/")).toContain("/11899/");
    expect(eventImageUrl("https://register-dogs.com/shelter/uploads/other_shelter/11899/a.jpg", "https://dogshelter.plovdiv.bg/")).toBeNull();
    expect(eventImageUrl("/media/images/photo.jpg", "https://operaplovdiv.bg")).toBe("https://operaplovdiv.bg/media/images/photo.jpg");
    for (const url of ["http://operaplovdiv.bg/media/images/a.jpg", "https://localhost/a.jpg", "https://storage.googleapis.com/other/file.jpg", "https://operaplovdiv.bg/timthumb.php?src=https://elsewhere.bg/a.jpg", "https://user:secret@operaplovdiv.bg/media/images/a.jpg"]) expect(eventImageUrl(url, "https://operaplovdiv.bg")).toBeNull();
  });
  it("requires the production title to match, including consistent accent normalization", () => {
    expect(normalizeEventTitle("РЪКОМАХАНЕ В СПОКÁН")).toBe(normalizeEventTitle("Ръкомахане в Спокàн"));
    const html = '<h1>Боряна</h1><img class="lead-image desktop-image" src="https://storage.googleapis.com/is-dtp/images/1.jpg">';
    expect(theatreDetailPhoto(html, "БОРЯНА")).toContain("/is-dtp/images/1.jpg");
    expect(() => theatreDetailPhoto(html, "Одисей")).toThrow("mismatch");
  });
  it("archives a bounded raster and rejects executable SVG", async () => {
    const dir = await mkdtemp(join(tmpdir(), "np-event-image-"));
    try {
      const bytes = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "navy" } }).jpeg().toBuffer();
      const image = await archiveEventImage(bytes, dir);
      expect(image.imageWidth).toBe(1400);
      expect((await sharp(await readFile(join(dir, "event-images", `${image.imageHash}.webp`))).metadata()).format).toBe("webp");
      await expect(archiveEventImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"></svg>'), dir)).rejects.toThrow("unsupported");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
