import { readMediaFile } from "@/lib/media-disk";
import { mediaCacheControl } from "@/lib/media-cache";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  const storageKey = key.join("/").replace(/\/+$/, "");
  if (!storageKey.startsWith("news/")) return new Response("Not found", { status: 404 });
  const bytes = await readMediaFile(storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });
  const extension = storageKey.split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": TYPES[extension] ?? "application/octet-stream",
      "cache-control": mediaCacheControl(storageKey),
      "x-content-type-options": "nosniff",
    },
  });
}
