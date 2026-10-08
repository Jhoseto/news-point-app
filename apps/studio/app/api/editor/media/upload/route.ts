import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, mediaAssets, mediaPresentations } from "@newspoint/db";
import { studioOrigins } from "../../../../../lib/auth";
import { staffFromRequest } from "../../../../../lib/session";
import { writeMediaFile, removeMediaFile } from "../../../../../lib/media-disk";
import { prepareUploadedPhotoWithVariants, UPLOADED_PHOTO_MAX_BYTES } from "../../../../../lib/uploaded-photo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) {
    return Response.json({ error: { message: "Невалиден източник." } }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { message: "Влезте отново." } }, { status: 401, headers: { "cache-control": "no-store" } });
  const limit = UPLOADED_PHOTO_MAX_BYTES + 256 * 1024;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit) return Response.json({ error: { message: "Снимката трябва да е до 25 MB." } }, { status: 413, headers: { "cache-control": "no-store" } });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Липсва снимка.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error("Снимката трябва да е до 25 MB.");
      }
      chunks.push(part.value);
    }
    const form = await new Response(new Blob(chunks as BlobPart[]), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData().catch(() => { throw new Error("Невалидно качване. Изберете файла отново."); });
    const file = form.get("file");
    const alt = String(form.get("alt") ?? "").trim().slice(0, 240);
    if (!(file instanceof File) || !file.type.startsWith("image/")) throw new Error("Изберете валидна снимка.");
    if (file.size > UPLOADED_PHOTO_MAX_BYTES) throw new Error("Снимката трябва да е до 25 MB.");
    const photo = await prepareUploadedPhotoWithVariants(Buffer.from(await file.arrayBuffer())).catch(() => { throw new Error("Файлът не е валидна или поддържана снимка."); });
    const now = new Date();
    const base = randomUUID();
    const folder = `news/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const fullKey = `${folder}/${base}.webp`;
    const variantKeys = photo.variants.map((variant) => ({ ...variant, key: `${folder}/${base}-w${variant.width}.webp` }));
    // Parallel writes: variants go up to 6 today.
    let assetId: string | undefined;
    try {
      const writes = await Promise.allSettled([writeMediaFile(fullKey, photo.full.buffer), ...variantKeys.map(variant => writeMediaFile(variant.key, variant.buffer))]);
      const failed = writes.find(result => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      const [asset] = await getDb()
        .insert(mediaAssets)
        .values({
          provider: "object_storage",
          storageKey: fullKey,
          mime: "image/webp",
          width: photo.full.width,
          height: photo.full.height,
          alt,
        })
        .returning({ id: mediaAssets.id });
      assetId = asset!.id;
      const variants = variantKeys.map((variant) => ({
        url: `/media/${variant.key}`,
        width: variant.width,
        height: variant.height,
      }));
      await getDb()
        .insert(mediaPresentations)
        .values({
          mediaAssetId: assetId,
          variants,
        })
        .onConflictDoNothing();
      return Response.json(
        { id: assetId, url: `/media/${fullKey}`, variants, alt, width: photo.full.width, height: photo.full.height, caption: "", credit: "" },
        { headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      // Roll back files AND the media row so we don't leave orphans
      // pointing at deleted keys. All writes have settled before cleanup; the
      // disk path may be on a separate volume that survives the rollback.
      await Promise.all([
        removeMediaFile(fullKey).catch(() => undefined),
        ...variantKeys.map((variant) => removeMediaFile(variant.key).catch(() => undefined)),
      ]);
      if (assetId) {
        await getDb().delete(mediaAssets).where(eq(mediaAssets.id, assetId)).catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = ["Липсва снимка.", "Изберете валидна снимка.", "Снимката трябва да е до 25 MB.", "Файлът не е валидна или поддържана снимка.", "Невалидно качване. Изберете файла отново."].includes(message);
    return Response.json({ error: { message: known ? message : "Качването не беше успешно. Опитайте отново." } }, { status: message === "Снимката трябва да е до 25 MB." ? 413 : known ? 400 : 500, headers: { "cache-control": "no-store" } });
  }
}
