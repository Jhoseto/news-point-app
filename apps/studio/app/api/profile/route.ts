import { editorMutation } from "@/lib/api";
import { authorProfileInput, saveOwnAuthorProfile } from "@/lib/author-profile";

export async function PATCH(request: Request) {
  return editorMutation(request, authorProfileInput, (staff, input) => saveOwnAuthorProfile(staff, input));
}
