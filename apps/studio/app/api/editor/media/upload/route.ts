import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { getDb, mediaAssets } from "@newspoint/db";
import { staffFromRequest } from "@/lib/session";
import { writeMediaFile, removeMediaFile } from "@/lib/media-disk";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { message: "Влезте отново." } }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const alt = String(form.get("alt") ?? "").trim().slice(0, 240);
  if (!(file instanceof File) || !file.type.startsWith("image/")) return Response.json({ error: { message: "Изберете валидна снимка." } }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return Response.json({ error: { message: "Снимката трябва да е до 25 MB." } }, { status: 413 });
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: 60_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error("Невалидна снимка.");
    const output = await image.rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    const now = new Date();
    const key = `news/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.webp`;
    await writeMediaFile(key, output);
    try {
      const [asset] = await getDb().insert(mediaAssets).values({ provider: "object_storage", storageKey: key, mime: "image/webp", width: Math.min(metadata.width, 4096), height: Math.min(metadata.height, 4096), alt }).returning({ id: mediaAssets.id });
      return Response.json({ id: asset!.id, url: `/media/${key}`, alt }, { headers: { "cache-control": "no-store" } });
    } catch (error) { await removeMediaFile(key).catch(() => undefined); throw error; }
  } catch (error) { return Response.json({ error: { message: error instanceof Error ? error.message : "Качването не беше успешно." } }, { status: 400 }); }
}
