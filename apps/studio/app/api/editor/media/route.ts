import { listMediaFolder, listMediaYears, mediaFolder } from "@/lib/media-library";
import { staffFromRequest } from "@/lib/session";

export async function GET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { code: "unauthenticated" } }, { status: 401, headers: { "cache-control": "no-store" } });
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder");
  if (!folder) {
    return Response.json({ years: await listMediaYears() }, { headers: { "cache-control": "no-store" } });
  }
  const safe = mediaFolder(folder);
  if (!safe || safe.split("/").length < 3) return Response.json({ error: { code: "invalid_folder" } }, { status: 400 });
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const page = await listMediaFolder(safe, offset);
  return Response.json(page, { headers: { "cache-control": "no-store" } });
}
