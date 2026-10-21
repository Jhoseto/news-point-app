import { z } from "zod";
import { withStaffAudit } from "../../../../../../lib/audit";
import { editorMutation } from "../../../../../../lib/api";
import { deleteArticle } from "../../../../../../lib/articles";

const deleteRequest = z.strictObject({ confirm: z.literal(true) });

// The hosting ingress denies DELETE before it reaches Studio. Keep all domain,
// origin, role, confirmation and audit checks on this explicit POST action.
async function handlePOST(request: Request, context: RouteContext<"/api/editor/articles/[id]/delete">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  return editorMutation(request, deleteRequest, (staff) => deleteArticle(staff, id));
}

export const POST = withStaffAudit(handlePOST);
