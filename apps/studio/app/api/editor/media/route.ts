import { withStaffAudit } from "../../../../lib/audit";
import { listMediaArchive, listMediaFolder, listMediaYears, mediaFolder, searchMediaLibrary } from "@/lib/media-library";
import { staffFromRequest } from "@/lib/session";

async function handleGET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { code: "unauthenticated" } }, { status: 401, headers: { "cache-control": "no-store" } });
  const url = new URL(request.url);
  const folderParam = url.searchParams.get("folder");
  const query = (url.searchParams.get("q") ?? "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const wantYears = url.searchParams.get("years") === "1";
  const wantAll = url.searchParams.get("all") === "1";

  if (wantYears || (!folderParam && !query && !wantAll && url.searchParams.get("offset") === null)) {
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

  if (wantAll || !folderParam) {
    const page = await listMediaArchive(offset);
    return Response.json(page, { headers: { "cache-control": "no-store" } });
  }

  const safe = mediaFolder(folderParam);
  if (!safe || safe.split("/").length < 3) return Response.json({ error: { code: "invalid_folder" } }, { status: 400 });
  const page = await listMediaFolder(safe, offset);
  return Response.json(page, { headers: { "cache-control": "no-store" } });
}

export const GET = withStaffAudit(handleGET);
