import { withStaffAudit } from "../../../../lib/audit";
import { editorMutation } from "@/lib/api";
import { createArticle } from "@/lib/articles";
import { draftInput } from "@/lib/editor/input";

function handlePOST(request: Request) {
  return editorMutation(request, draftInput, (staff, draft) => createArticle(staff, draft), 201);
}

export const POST = withStaffAudit(handlePOST);
