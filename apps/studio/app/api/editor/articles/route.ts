import { editorMutation } from "@/lib/api";
import { createArticle } from "@/lib/articles";
import { draftInput } from "@/lib/editor/input";

export function POST(request: Request) {
  return editorMutation(request, draftInput, (staff, draft) => createArticle(staff, draft), 201);
}
