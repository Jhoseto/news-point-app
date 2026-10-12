import { withStaffAudit } from "../../../../../lib/audit";
import { z } from "zod";
import { editorMutation } from "@/lib/api";
import { deleteArticle } from "@/lib/articles";

const deleteRequest = z.strictObject({ confirm: z.literal(true) });

async function handleDELETE(request: Request, context: RouteContext<"/api/editor/articles/[id]">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  return editorMutation(request, deleteRequest, (staff) => deleteArticle(staff, id));
}

export const DELETE = withStaffAudit(handleDELETE);
