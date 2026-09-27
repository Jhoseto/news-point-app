import { studioOrigins } from "@/lib/auth";
import { deleteProfilePhoto, readProfilePhoto, uploadProfilePhoto } from "@/lib/profile-photo";
import { editorMutation } from "@/lib/api";
import { z } from "zod";
import { staffFromRequest } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  return editorMutation(request, z.strictObject({}), (staff) => deleteProfilePhoto(staff));
}

export async function GET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
  return (await readProfilePhoto(staff.id)) ?? new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) return Response.json({ error: { message: "Невалиден източник." } }, { status: 403 });
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { message: "Влезте отново." } }, { status: 401 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 10 * 1024 * 1024 + 256 * 1024) return Response.json({ error: { message: "Снимката трябва да е до 10 MB." } }, { status: 413 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Липсва снимка.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 10 * 1024 * 1024 + 256 * 1024) { await reader.cancel(); throw new Error("Снимката трябва да е до 10 MB."); }
      chunks.push(part.value);
    }
    const data = await new Response(new Blob(chunks as BlobPart[]), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
    const file = data.get("photo");
    if (!(file instanceof File)) return Response.json({ error: { message: "Изберете снимка." } }, { status: 400 });
    const result = await uploadProfilePhoto(staff, file);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: { message: error instanceof Error ? error.message : "Качването не беше успешно." } }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
