import "server-only";
import { desc, eq } from "@newspoint/db/orm";
import { getDb, livepointSubmissions, type LivepointSubmissionStatus } from "@newspoint/db";

export async function listSubmissions(status?: LivepointSubmissionStatus, kind?: "report" | "my_news") {
  const conditions = [];
  if (status) conditions.push(eq(livepointSubmissions.status, status));
  if (kind) conditions.push(eq(livepointSubmissions.kind, kind));
  return getDb().select().from(livepointSubmissions).where(conditions.length ? conditions[0] : undefined).orderBy(desc(livepointSubmissions.createdAt)).limit(200);
}
