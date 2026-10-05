import { z } from "zod";
import { editorMutation } from "@/lib/api";
import {
  addArticleToTheme,
  createStoryTheme,
  deleteStoryTheme,
  publishStoryTheme,
  removeArticleFromTheme,
  reorderThemeArticles,
  saveStoryTheme,
  unpublishStoryTheme,
} from "@/lib/story-themes";
import { requireStaff } from "@/lib/session";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const inputSchema = z.strictObject({
  slug: z.string().min(3).max(80).regex(SLUG_PATTERN),
  title: z.string().min(5).max(160),
  summary: z.string().max(280).default(""),
  intro: z.string().max(4000).default(""),
  coverMediaId: z.uuid().nullable().optional(),
  coverCaption: z.string().max(280).default(""),
});

const saveSchema = inputSchema;

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    ...inputSchema.shape,
    articleIds: z.array(z.uuid()).max(200).optional(),
  }).strict(),
  // On `save` (edit mode) article changes are already committed through
  // addArticle / removeArticle / reorder — sending them again would clobber
  // the canonical set. So we accept metadata only.
  z.object({ action: z.literal("save"), id: z.uuid(), ...saveSchema.shape }).strict(),
  z.object({ action: z.literal("publish"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("unpublish"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("delete"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("addArticle"), themeId: z.uuid(), articleId: z.uuid(), position: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("removeArticle"), themeId: z.uuid(), articleId: z.uuid() }).strict(),
  z.object({ action: z.literal("reorder"), themeId: z.uuid(), articleIds: z.array(z.uuid()).min(1).max(200) }).strict(),
]);

export async function POST(request: Request) {
  return editorMutation(request, bodySchema, async (staff, input) => {
    const resolvedStaff = staff ?? (await requireStaff());
    switch (input.action) {
      case "create": {
        const result = await createStoryTheme(
          resolvedStaff,
          {
            slug: input.slug,
            title: input.title,
            summary: input.summary ?? "",
            intro: input.intro ?? "",
            coverMediaId: input.coverMediaId ?? null,
            coverCaption: input.coverCaption ?? "",
          },
          input.articleIds ?? [],
        );
        return { action: input.action, id: result.id, slug: result.slug };
      }
      case "save": {
        await saveStoryTheme(
          resolvedStaff,
          input.id,
          {
            slug: input.slug,
            title: input.title,
            summary: input.summary,
            intro: input.intro,
            coverMediaId: input.coverMediaId ?? null,
            coverCaption: input.coverCaption,
          },
        );
        return { action: input.action, id: input.id };
      }
      case "publish":
        await publishStoryTheme(resolvedStaff, input.id);
        return { action: input.action, id: input.id };
      case "unpublish":
        await unpublishStoryTheme(resolvedStaff, input.id);
        return { action: input.action, id: input.id };
      case "delete":
        await deleteStoryTheme(resolvedStaff, input.id);
        return { action: input.action, id: input.id };
      case "addArticle":
        await addArticleToTheme(resolvedStaff, input.themeId, input.articleId, input.position);
        return { action: input.action, themeId: input.themeId, articleId: input.articleId };
      case "removeArticle":
        await removeArticleFromTheme(resolvedStaff, input.themeId, input.articleId);
        return { action: input.action, themeId: input.themeId, articleId: input.articleId };
      case "reorder":
        await reorderThemeArticles(resolvedStaff, input.themeId, input.articleIds);
        return { action: input.action, themeId: input.themeId };
    }
  });
}
