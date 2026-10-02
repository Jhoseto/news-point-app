import { z } from "zod";
import { desc, eq } from "@newspoint/db/orm";
import { getDb, livepointSubmissions } from "@newspoint/db";
import { editorMutation } from "@/lib/api";
import { EditorError } from "@/lib/articles";
import { staffFromRequest } from "@/lib/session";

const updateInput = z.strictObject({ id: z.uuid(), status: z.enum(["received", "in_review", "verified", "rejected", "published"]), articleId: z.uuid().nullable().optional() });

export async function GET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { code: "unauthenticated" } }, { status: 401 });
  const url = new URL(request.url);
  const rows = await getDb().select().from(livepointSubmissions).orderBy(desc(livepointSubmissions.createdAt)).limit(200);
  const status = url.searchParams.get("status");
  const kind = url.searchParams.get("kind");
  return Response.json({ items: rows.filter((row) => (!status || row.status === status) && (!kind || row.kind === kind)) }, { headers: { "cache-control": "no-store" } });
}

export function PATCH(request: Request) {
  return editorMutation(request, updateInput, async (_staff, input) => {
    const [row] = await getDb().update(livepointSubmissions).set({ status: input.status, ...(input.articleId !== undefined ? { articleId: input.articleId } : {}) }).where(eq(livepointSubmissions.id, input.id)).returning();
    if (!row) throw new EditorError(404, "not_found", "Сигналът не съществува.");
    return { item: row };
  });
}
