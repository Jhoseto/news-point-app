import { withStaffAudit } from "../../../../../lib/audit";
import { z } from "zod";
import { editorMutation } from "../../../../../lib/api";
import { EditorError } from "../../../../../lib/articles";
import { renameMediaAsset } from "../../../../../lib/media-library";

const renameRequest = z.strictObject({
  alt: z.string().min(1).max(240),
});

async function handlePATCH(request: Request, context: RouteContext<"/api/editor/media/[id]">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: { code: "not_found", message: "Снимката не съществува." } }, { status: 404 });
  return editorMutation(request, renameRequest, async (_staff, input) => {
    try {
      return await renameMediaAsset(id, input.alt);
    } catch (caught) {
      if (caught instanceof Error && "status" in caught && "code" in caught) {
        const status = Number((caught as { status: number }).status);
        const code = String((caught as { code: string }).code);
        throw new EditorError(
          status === 404 ? 404 : status === 400 ? 400 : 422,
          code,
          caught.message,
        );
      }
      throw caught;
    }
  });
}

export const PATCH = withStaffAudit(handlePATCH);
export const POST = withStaffAudit(handlePATCH);
