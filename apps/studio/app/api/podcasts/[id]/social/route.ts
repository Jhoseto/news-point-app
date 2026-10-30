import { z } from "zod";
import { getDb } from "@newspoint/db";
import { PodcastSocialError, readPodcastSocialStatus, sharePodcastToFacebook } from "@newspoint/db/social-publishing";
import { editorMutation } from "../../../../../lib/api";
import { EditorError } from "../../../../../lib/articles";
import { withStaffAudit } from "../../../../../lib/audit";
import { auditEvidence } from "../../../../../lib/audit-context";
import { staffFromRequest } from "../../../../../lib/session";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const input = z.strictObject({ action: z.enum(["share", "retry"]), revision: z.number().int().positive() });
const headers = { "cache-control": "private, no-store" };
const failure = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status, headers });

async function handleGET(request: Request, context: Context) {
  const staff = await staffFromRequest(request);
  if (!staff) return failure(401, "unauthenticated", "Влезте отново.");
  if (!["editor", "admin", "master_admin"].includes(staff.role)) return failure(403, "forbidden", "Нямате редакционни права.");
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return failure(404, "not_found", "Епизодът не е намерен.");
  try {
    return Response.json(await readPodcastSocialStatus(getDb(), id), { headers });
  } catch (error) {
    if (error instanceof PodcastSocialError) return failure(error.status, error.code, error.message);
    return failure(503, "unavailable", "Статусът на споделянето временно не е достъпен. Опитайте отново.");
  }
}

async function handlePOST(request: Request, context: Context) {
  return editorMutation(request, input, async (_staff, value) => {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new EditorError(404, "not_found", "Епизодът не е намерен.");
    try {
      const status = await sharePodcastToFacebook(getDb(), id, value.revision, value.action);
      // A queued request is not a confirmed Facebook publication.
      auditEvidence(null, { podcastId: id, revision: value.revision, action: value.action, jobId: status.job?.id ?? null, status: status.job?.status ?? null });
      return status;
    } catch (error) {
      if (error instanceof PodcastSocialError) throw new EditorError(error.status, error.code, error.message);
      throw new EditorError(503, "unavailable", "Споделянето временно не е достъпно. Проверете статуса преди повторен опит.");
    }
  }, 202);
}

export const GET = withStaffAudit(handleGET);
export const POST = withStaffAudit(handlePOST);
