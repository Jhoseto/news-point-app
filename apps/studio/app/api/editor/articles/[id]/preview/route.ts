import { z } from "zod";
import { getPreview } from "@/lib/articles";
import { staffFromRequest } from "@/lib/session";

export async function GET(request: Request, context: RouteContext<"/api/editor/articles/[id]/preview">) {
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { code: "unauthenticated" } }, { status: 401, headers: { "cache-control": "no-store" } });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: { code: "not_found" } }, { status: 404, headers: { "cache-control": "no-store" } });
  const preview = await getPreview(id);
  if (!preview) return Response.json({ error: { code: "not_found" } }, { status: 404, headers: { "cache-control": "no-store" } });
  return Response.json({
    ...preview,
    publishedAt: preview.publishedAt?.toISOString() ?? null,
  }, { headers: { "cache-control": "no-store" } });
}
