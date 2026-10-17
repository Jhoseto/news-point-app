import { withStaffAudit } from "../../../lib/audit";
import { z } from "zod";
import { arrangementDocumentSchema } from "@newspoint/content";
import { editorMutation } from "@/lib/api";
import { staffFromRequest } from "@/lib/session";
import { loadArrangement, placeArticle, publishArrangement, revertArrangement, saveArrangement } from "@/lib/arrangements";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    pageKey: z.string().min(1).max(80),
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
    note: z.string().max(400),
    document: arrangementDocumentSchema,
  }).strict(),
  z.object({
    action: z.literal("publish"),
    pageKey: z.string().min(1).max(80),
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  z.object({
    action: z.literal("revert"),
    pageKey: z.string().min(1).max(80),
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
    historyId: z.uuid(),
  }).strict(),
  z.object({
    action: z.literal("place"),
    pageKey: z.string().min(1).max(80),
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
    slot: z.string().min(1).max(80),
    articleId: z.uuid(),
    hours: z.number().int().min(1).max(168).nullable(),
    /** When true, publish the page arrangement so the public site shows the placement. */
    publish: z.boolean().optional(),
  }).strict(),
]);

async function handlePOST(request: Request) {
  return editorMutation(request, bodySchema, async (staff, input) => {
    if (input.action === "save") return { saved: true, ...await saveArrangement(staff, input.pageKey, input.document, input.note, input.expectedVersion) };
    if (input.action === "publish") return publishArrangement(staff, input.pageKey, input.expectedVersion);
    if (input.action === "revert") return { reverted: true, ...await revertArrangement(staff, input.pageKey, input.historyId, input.expectedVersion) };
    return { placed: true, published: !!input.publish, ...await placeArticle(staff, { ...input, publish: !!input.publish }) };
  });
}

export const POST = withStaffAudit(handlePOST);

async function handleGET(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { message: "Влезте отново." } }, { status: 401, headers });
  if (!["editor", "admin", "master_admin"].includes(staff.role)) return Response.json({ error: { message: "Нямате редакционни права." } }, { status: 403, headers });
  const pageKey = new URL(request.url).searchParams.get("page") ?? "home";
  try { return Response.json({ version: (await loadArrangement(pageKey)).version }, { headers }); }
  catch { return Response.json({ error: { message: "Подреждането не може да се зареди." } }, { status: 422, headers }); }
}

export const GET = withStaffAudit(handleGET);
