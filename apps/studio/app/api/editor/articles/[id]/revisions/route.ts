import { z } from "zod";
import { editorMutation } from "@/lib/api";
import { saveRevision } from "@/lib/articles";
import { saveRequest } from "@/lib/editor/input";

export async function POST(request: Request, context: RouteContext<"/api/editor/articles/[id]/revisions">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  return editorMutation(request, saveRequest, (staff, input) => saveRevision(staff, id, input.expectedRevision, input.draft));
}
