import { withStaffAudit } from "../../../../lib/audit";
import { z } from "zod";
import { editorMutation } from "@/lib/api";
import { changeRole, deleteUser, roleChangeInput } from "@/lib/users";

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);
const notFound = () => Response.json({ error: { code: "not_found", message: "Профилът не съществува." } }, { status: 404 });

async function handlePATCH(request: Request, context: RouteContext<"/api/staff/[id]">) {
  const { id } = await context.params;
  if (!validId(id)) return notFound();
  return editorMutation(request, roleChangeInput, (staff, input) => changeRole(staff, id, input.role));
}

async function handleDELETE(request: Request, context: RouteContext<"/api/staff/[id]">) {
  const { id } = await context.params;
  if (!validId(id)) return notFound();
  return editorMutation(request, z.object({}), (staff) => deleteUser(staff, id));
}

export const PATCH = withStaffAudit(handlePATCH);
export const DELETE = withStaffAudit(handleDELETE);
