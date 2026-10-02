import { z } from "zod";
import { editorMutation } from "@/lib/api";
import { publishRevision } from "@/lib/articles";
import { publishRequest } from "@/lib/editor/input";

export async function POST(request: Request, context: RouteContext<"/api/editor/articles/[id]/publish">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  return editorMutation(request, publishRequest, (staff, input) => publishRevision(staff, id, input.revision, input.idempotencyKey, input.listenEnabled));
}
