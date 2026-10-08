import { z } from "zod";
import { editorMutation } from "@/lib/api";
import { EditorError, listRevisionHistory, saveRevision } from "@/lib/articles";
import { staffFromRequest } from "@/lib/session";
import { saveRequest } from "@/lib/editor/input";

export async function GET(request: Request, context: RouteContext<"/api/editor/articles/[id]/revisions">) {
  const headers = { "cache-control": "private, no-store" };
  if (!await staffFromRequest(request)) return Response.json({ error: { code: "unauthenticated", message: "Влезте отново." } }, { status: 401, headers });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: { code: "not_found" } }, { status: 404, headers });
  try { return Response.json(await listRevisionHistory(id), { headers }); }
  catch (error) { if (error instanceof EditorError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers }); throw error; }
}

export async function POST(request: Request, context: RouteContext<"/api/editor/articles/[id]/revisions">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  return editorMutation(request, saveRequest, (staff, input) => saveRevision(staff, id, input.expectedRevision, input.draft));
}
