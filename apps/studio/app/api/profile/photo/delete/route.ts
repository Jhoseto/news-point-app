import { z } from "zod";
import { withStaffAudit } from "../../../../../lib/audit";
import { editorMutation } from "../../../../../lib/api";
import { deleteProfilePhoto } from "../../../../../lib/profile-photo";

async function handlePOST(request: Request) {
  return editorMutation(request, z.strictObject({}), (staff) => deleteProfilePhoto(staff));
}

export const POST = withStaffAudit(handlePOST);
