import { z } from "zod";
import { withStaffAudit } from "../../../../../lib/audit";
import { editorMutation } from "../../../../../lib/api";
import { deleteUser } from "../../../../../lib/users";

async function handlePOST(request: Request, context: RouteContext<"/api/staff/[id]/delete">) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return Response.json({ error: { code: "not_found", message: "Профилът не съществува." } }, { status: 404 });
  return editorMutation(request, z.object({}), (staff) => deleteUser(staff, id));
}

export const POST = withStaffAudit(handlePOST);
