import { listMediaFolder, listMediaYears, mediaFolder, searchMediaLibrary } from "@/lib/media-library";
import { staffFromRequest } from "@/lib/session";

export async function GET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { code: "unauthenticated" } }, { status: 401, headers: { "cache-control": "no-store" } });
  const url = new URL(request.url);
  const folderParam = url.searchParams.get("folder");
  const query = (url.searchParams.get("q") ?? "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

  if (!folderParam && !query) {
    return Response.json({ years: await listMediaYears() }, { headers: { "cache-control": "no-store" } });
  }

  if (query) {
    const folder = folderParam ? mediaFolder(folderParam) : null;
    if (folderParam && (!folder || folder.split("/").length < 3)) {
      return Response.json({ error: { code: "invalid_folder" } }, { status: 400 });
    }
    const page = await searchMediaLibrary(query, { folder, offset });
    return Response.json(page, { headers: { "cache-control": "no-store" } });
  }

  const safe = mediaFolder(folderParam ?? "");
  if (!safe || safe.split("/").length < 3) return Response.json({ error: { code: "invalid_folder" } }, { status: 400 });
  const page = await listMediaFolder(safe, offset);
  return Response.json(page, { headers: { "cache-control": "no-store" } });
}
