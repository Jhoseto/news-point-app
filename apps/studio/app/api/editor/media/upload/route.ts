import { randomUUID } from "node:crypto";
import { getDb, mediaAssets, mediaPresentations } from "@newspoint/db";
import { studioOrigins } from "@/lib/auth";
import { staffFromRequest } from "@/lib/session";
import { writeMediaFile, removeMediaFile } from "@/lib/media-disk";
import { prepareUploadedPhotoWithVariants, UPLOADED_PHOTO_MAX_BYTES } from "@/lib/uploaded-photo";

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
    const form = await new Response(new Blob(chunks as BlobPart[]), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
    const file = form.get("file");
    const alt = String(form.get("alt") ?? "").trim().slice(0, 240);
    if (!(file instanceof File) || !file.type.startsWith("image/")) throw new Error("Изберете валидна снимка.");
    if (file.size > UPLOADED_PHOTO_MAX_BYTES) throw new Error("Снимката трябва да е до 25 MB.");
    const photo = await prepareUploadedPhotoWithVariants(Buffer.from(await file.arrayBuffer()));
    const now = new Date();
    const base = randomUUID();
    const folder = `news/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const fullKey = `${folder}/${base}.webp`;
    const variantKeys = photo.variants.map((variant) => ({ ...variant, key: `${folder}/${base}-w${variant.width}.webp` }));
    await writeMediaFile(fullKey, photo.full.buffer);
    for (const variant of variantKeys) {
      await writeMediaFile(variant.key, variant.buffer);
    }
    try {
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
      const variants = variantKeys.map((variant) => ({
        url: `/media/${variant.key}`,
        width: variant.width,
        height: variant.height,
      }));
      await getDb()
        .insert(mediaPresentations)
        .values({
          mediaAssetId: asset!.id,
          variants,
        })
        .onConflictDoNothing();
      return Response.json(
        { id: asset!.id, url: `/media/${fullKey}`, variants, alt },
        { headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      await removeMediaFile(fullKey).catch(() => undefined);
      for (const variant of variantKeys) await removeMediaFile(variant.key).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return Response.json({ error: { message: error instanceof Error ? error.message : "Качването не беше успешно." } }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
