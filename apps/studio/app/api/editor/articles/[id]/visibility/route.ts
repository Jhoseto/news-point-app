import { z } from "zod";
import { editorMutation } from "@/lib/api";
import { setArticleVisibility } from "@/lib/articles";

const visibilityRequest = z.strictObject({ visible: z.boolean() });

export async function POST(request: Request, context: RouteContext<"/api/editor/articles/[id]/visibility">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  return editorMutation(request, visibilityRequest, (staff, input) =>
    setArticleVisibility(id, input.visible, { id: staff.id, name: staff.name ?? staff.email }),
  );
}
