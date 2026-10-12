import { withStaffAudit } from "../../../lib/audit";
import { editorMutation } from "@/lib/api";
import { createUser, createUserInput } from "@/lib/users";

async function handlePOST(request: Request) {
  return editorMutation(request, createUserInput, (staff, input) => createUser(staff, input), 201);
}

export const POST = withStaffAudit(handlePOST);
