import { z } from "zod";
import { getDb, articles } from "@newspoint/db";
import { eq } from "@newspoint/db/orm";
import { readSocialStatus, retrySocialPublication } from "@newspoint/db/social-publishing";
import { staffFromRequest } from "@/lib/session";
import { editorMutation } from "@/lib/api";
import { EditorError } from "@/lib/articles";
import { withStaffAudit } from "@/lib/audit";
async function handleGET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "cache-control": "private, no-store" };
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { message: "Влезте отново." } }, { status: 401, headers });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({}, { status: 404, headers });
  const [article] = await getDb().select({ id: articles.id }).from(articles).where(eq(articles.id, id));
  if (!article) return Response.json({}, { status: 404, headers });
  return Response.json(await readSocialStatus(getDb(), id), { headers });
}
async function handlePOST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return editorMutation(request, z.strictObject({ action: z.literal("retry") }), async () => {
    if (!z.uuid().safeParse(id).success || !await retrySocialPublication(getDb(), id)) throw new EditorError(422, "not_retryable", "Обновете новината или се свържете с администратора.");
    return readSocialStatus(getDb(), id);
  }, 202);
}
export const GET = withStaffAudit(handleGET);
export const POST = withStaffAudit(handlePOST);
