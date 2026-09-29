import { z } from "zod";
import { arrangementDocumentSchema } from "@newspoint/content";
import { editorMutation } from "@/lib/api";
import { placeArticle, publishArrangement, revertArrangement, saveArrangement } from "@/lib/arrangements";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    pageKey: z.string().min(1).max(80),
    note: z.string().max(400),
    document: arrangementDocumentSchema,
  }).strict(),
  z.object({
    action: z.literal("publish"),
    pageKey: z.string().min(1).max(80),
  }).strict(),
  z.object({
    action: z.literal("revert"),
    pageKey: z.string().min(1).max(80),
    historyId: z.uuid(),
  }).strict(),
  z.object({
    action: z.literal("place"),
    pageKey: z.string().min(1).max(80),
    slot: z.string().min(1).max(80),
    articleId: z.uuid(),
    hours: z.number().int().min(1).max(168).nullable(),
  }).strict(),
]);

export async function POST(request: Request) {
  return editorMutation(request, bodySchema, async (staff, input) => {
    if (input.action === "save") {
      await saveArrangement(staff, input.pageKey, input.document, input.note);
      return { saved: true };
    }
    if (input.action === "publish") return publishArrangement(staff, input.pageKey);
    if (input.action === "revert") {
      await revertArrangement(staff, input.pageKey, input.historyId);
      return { reverted: true };
    }
    await placeArticle(staff, input);
    return { placed: true };
  });
}
