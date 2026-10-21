import { withStaffAudit } from "../../../lib/audit";
import { editorMutation } from "../../../lib/api";
import { authorProfileInput, saveOwnAuthorProfile } from "../../../lib/author-profile";

async function handlePATCH(request: Request) {
  return editorMutation(request, authorProfileInput, (staff, input) => saveOwnAuthorProfile(staff, input));
}

export const PATCH = withStaffAudit(handlePATCH);
export const POST = withStaffAudit(handlePATCH);
