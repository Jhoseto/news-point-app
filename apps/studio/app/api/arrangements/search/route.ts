import { withStaffAudit } from "../../../../lib/audit";
import { staffFromRequest } from "@/lib/session";
import { searchPlacementArticles } from "@/lib/arrangements";

async function handleGET(request: Request) {
  if (!await staffFromRequest(request)) return Response.json({ error: { message: "Влезте отново." } }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const articles = await searchPlacementArticles(query);
  return Response.json({ articles }, { headers: { "cache-control": "no-store" } });
}

export const GET = withStaffAudit(handleGET);
