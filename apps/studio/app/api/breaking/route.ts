import { breakingInputSchema } from "@newspoint/content";
import { BreakingWriteError, getDb, readBreakingSettings, writeBreaking } from "@newspoint/db";
import { editorMutation } from "../../../lib/api";
import { EditorError } from "../../../lib/articles";
import { staffFromRequest } from "../../../lib/session";
import { withStaffAudit } from "../../../lib/audit";
import { auditEvidence } from "../../../lib/audit-context";

const headers = { "cache-control": "private, no-store" };
async function handleGET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { message: "Влезте отново." } }, { status: 401, headers });
  if (!["editor", "admin", "master_admin"].includes(staff.role)) return Response.json({ error: { message: "Нямате редакционни права." } }, { status: 403, headers });
  return Response.json(await readBreakingSettings(getDb()), { headers });
}
export const GET = withStaffAudit(handleGET);

async function handlePOST(request: Request) {
  const response = await editorMutation(request, breakingInputSchema, async (staff, input) => {
    try {
      const { before, after } = await writeBreaking(getDb(), input, staff.id);
      auditEvidence(before, after);
      return after;
    } catch (error) {
      if (error instanceof BreakingWriteError) throw new EditorError(error.status, error.code, error.message);
      throw error;
    }
  });
  response.headers.set("cache-control", headers["cache-control"]);
  return response;
}
export const POST = withStaffAudit(handlePOST);
