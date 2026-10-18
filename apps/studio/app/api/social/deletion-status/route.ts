import { z } from "zod";
import { getDb, socialDeletionReceipts } from "@newspoint/db";
import { and, eq, gt } from "@newspoint/db/orm";
import { hasSocialPublishing } from "@newspoint/db/social-publishing";
import { withStaffAudit } from "@/lib/audit";
async function handleGET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const headers = { "cache-control": "private, no-store" };
  if (!z.uuid().safeParse(code).success || !await hasSocialPublishing(getDb())) return Response.json({}, { status: 404, headers });
  const [receipt] = await getDb().select({ id: socialDeletionReceipts.id }).from(socialDeletionReceipts).where(and(eq(socialDeletionReceipts.id, code), gt(socialDeletionReceipts.expiresAt, new Date())));
  return receipt ? Response.json({ status: "completed", message: "Разрешението и съхраненият Facebook токен са премахнати.", confirmation_code: code }, { headers }) : Response.json({}, { status: 404, headers });
}
export const GET = withStaffAudit(handleGET);
