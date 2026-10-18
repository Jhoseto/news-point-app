import { z } from "zod";
import { editorMutation } from "@/lib/api";
import { withStaffAudit } from "@/lib/audit";
import { EditorError } from "@/lib/articles";
import { startFacebookConnection, selectFacebookPage, disconnectFacebook, reconcileFacebook } from "@/lib/social-facebook";

const input = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("connect") }), z.strictObject({ action: z.literal("disconnect") }),
  z.strictObject({ action: z.literal("select"), selection: z.string().regex(/^[A-Za-z0-9_-]{43}$/), pageId: z.string().regex(/^\d+$/) }),
  z.strictObject({ action: z.literal("reconcile"), jobId: z.uuid(), objectId: z.string().regex(/^\d+(?:_\d+)?$/) }),
]);
async function handlePOST(request: Request) {
  return editorMutation(request, input, async (staff, data) => {
    try {
      if (data.action === "connect") return await startFacebookConnection(staff);
      if (data.action === "select") return await selectFacebookPage(staff, data.selection, data.pageId);
      if (data.action === "reconcile") return await reconcileFacebook(staff, data.jobId, data.objectId);
      return await disconnectFacebook(staff);
    } catch (error) {
      // Do not allow provider/configuration errors with sensitive internals into the general logger.
      if (error instanceof EditorError) throw error;
      throw new EditorError(422, "facebook_unavailable", "Връзката с Facebook не успя. Проверете настройките и опитайте отново.");
    }
  });
}
export const POST = withStaffAudit(handlePOST);
