import sharp from "sharp";

export const PROFILE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;

export async function prepareProfilePhoto(file: File) {
  if (!file.size || file.size > PROFILE_PHOTO_MAX_BYTES) throw new Error("Снимката трябва да е до 10 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Изберете JPEG, PNG или WebP снимка.");
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PIXELS });
    const metadata = await image.metadata();
    if (metadata.format === "png") {
      let offset = 8;
      while (offset + 12 <= bytes.length) {
        if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") throw new Error("animated");
        offset += bytes.readUInt32BE(offset) + 12;
      }
    }
    const expected = file.type === "image/jpeg" ? "jpeg" : file.type.slice("image/".length);
    if (metadata.format !== expected || (metadata.pages ?? 1) !== 1) throw new Error("invalid");
    const result = await image.rotate().resize(512, 512, { fit: "cover", position: "centre", withoutEnlargement: false })
      .webp({ quality: 84, effort: 4 }).timeout({ seconds: 10 }).toBuffer();
    if (result.length > 2 * 1024 * 1024) throw new Error("large");
    return result;
  } catch {
    throw new Error("Снимката е повредена, анимирана или прекалено голяма като размери.");
  }
}
