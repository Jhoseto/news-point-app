import { z } from "zod";
import { podcastForStaff } from "@newspoint/db/podcasts";
import { editorMutation } from "../../../../../lib/api";
import { EditorError } from "../../../../../lib/articles";
import { withStaffAudit } from "../../../../../lib/audit";
import { auditEvidence } from "../../../../../lib/audit-context";
import { downloadPodcastTikTok, PodcastTikTokError, readPodcastTikTok, startPodcastTikTok } from "../../../../../lib/podcast-tiktok-jobs";
import { staffFromRequest } from "../../../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };
const requestBody = z.strictObject({ revision: z.number().int().positive() });
type Context = { params: Promise<{ id: string }> };
const failure = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status, headers });

async function handlePOST(request: Request, context: Context) {
  return editorMutation(request, requestBody, async (staff, { revision }) => {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new EditorError(404, "not_found", "Епизодът не е намерен.");
    const episode = await podcastForStaff(id);
    if (!episode) throw new EditorError(404, "not_found", "Епизодът не е намерен.");
    if (episode.revision !== revision) throw new EditorError(409, "revision_conflict", "Епизодът е променен. Презаредете, за да изтеглите актуалната версия.");
    try {
      const status = startPodcastTikTok(staff.id, episode);
      auditEvidence(null, { podcastId: id, revision, jobId: status.jobId, state: status.state });
      return status;
    } catch (error) {
      if (error instanceof PodcastTikTokError) throw new EditorError(error.status, error.code, error.message);
      throw error;
    }
  }, 202);
}

async function handleGET(request: Request, context: Context) {
  const staff = await staffFromRequest(request);
  if (!staff) return failure(401, "unauthenticated", "Влезте отново.");
  if (!["editor", "admin", "master_admin"].includes(staff.role)) return failure(403, "forbidden", "Нямате редакционни права.");
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;
  const job = params.get("job");
  if (!z.uuid().safeParse(id).success || !job || !z.uuid().safeParse(job).success) return failure(404, "not_found", "Видеото не е намерено.");
  try {
    if (params.get("download") === "1") return await downloadPodcastTikTok(staff.id, id, job, request.headers.get("range"));
    return Response.json(readPodcastTikTok(staff.id, id, job), { headers });
  } catch (error) {
    if (error instanceof PodcastTikTokError) return failure(error.status, error.code, error.message);
    return failure(503, "export_unavailable", "Експортът временно не е достъпен. Опитайте отново.");
  }
}

export const POST = withStaffAudit(handlePOST);
export const GET = withStaffAudit(handleGET, { skipRead: request => new URL(request.url).searchParams.get("download") !== "1" });
