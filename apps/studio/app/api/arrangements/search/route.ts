import { staffFromRequest } from "@/lib/session";
import { searchPlacementArticles } from "@/lib/arrangements";

export async function GET(request: Request) {
  if (!await staffFromRequest(request)) return Response.json({ error: { message: "Влезте отново." } }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const articles = await searchPlacementArticles(query);
  return Response.json({ articles }, { headers: { "cache-control": "no-store" } });
}
