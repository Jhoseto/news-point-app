import { z } from "zod";
import { SLUG_MAX, SLUG_PATTERN } from "./slug";

// Shared by the editor form and the API; the API always re-validates.

export const TITLE_MAX = 200;
export const EXCERPT_MAX = 400;
export const BODY_TEXT_MAX = 100_000;
export const AUTHOR_NAME_MAX = 120;

const authorName = z
  .string()
  .trim()
  .min(2, "Въведете име на автора")
  .max(AUTHOR_NAME_MAX, `Името е до ${AUTHOR_NAME_MAX} знака`)
  .refine((value) => !/[<>\u0000-\u001f\u007f]/u.test(value), "Името съдържа непозволени знаци");

export const draftInput = z
  .strictObject({
    title: z.string().trim().max(TITLE_MAX),
    slug: z.string().trim().max(SLUG_MAX).refine((value) => value === "" || SLUG_PATTERN.test(value), "Невалиден адрес"),
    excerpt: z.string().trim().max(EXCERPT_MAX),
    bodyText: z.string().max(BODY_TEXT_MAX),
    primaryCategoryId: z.uuid().nullable(),
    heroMediaId: z.uuid().nullable(),
    heroEmbedUrl: z.string().url().nullable().optional(),
    authorKind: z.enum(["staff", "newsroom", "manual"]),
    authorUserId: z.string().min(1).nullable(),
    authorName,
    viewSeed: z.number().int().min(0).max(100_000_000).nullable().optional(),
    viewEvery: z.number().int().min(1).max(100_000).nullable().optional(),
    viewUnit: z.enum(["seconds", "minutes", "hours"]).optional(),
    viewTarget: z.number().int().min(0).max(100_000_000).nullable().optional(),
  })
  .superRefine((draft, context) => {
    if (draft.authorKind === "staff" && !draft.authorUserId) {
      context.addIssue({ code: "custom", path: ["authorUserId"], message: "Липсва авторски профил" });
    }
    if (draft.authorKind !== "staff" && draft.authorUserId !== null) {
      context.addIssue({ code: "custom", path: ["authorUserId"], message: "Този подпис не използва профил" });
    }
    if (draft.authorKind === "newsroom" && draft.authorName !== "NewsPoint.bg") {
      context.addIssue({ code: "custom", path: ["authorName"], message: "Редакционният подпис е NewsPoint.bg" });
    }
    if (draft.viewSeed != null && draft.viewTarget != null && draft.viewTarget < draft.viewSeed) {
      context.addIssue({ code: "custom", path: ["viewTarget"], message: "Крайният брой не може да е по-малък от броя при публикуване." });
    }
  });
export type DraftInput = z.infer<typeof draftInput>;

export const saveRequest = z.strictObject({
  expectedRevision: z.int().min(0),
  draft: draftInput,
});

export const publishRequest = z.strictObject({
  revision: z.int().positive(),
  idempotencyKey: z.uuid(),
});

/** What still blocks publication, in the editor's language. Empty means ready. */
export function publishProblems(draft: {
  title: string;
  slug: string;
  bodyBlocks: number;
  primaryCategoryId: string | null;
  heroMediaId: string | null;
  authorKind: "staff" | "newsroom" | "manual";
  authorName: string;
}): string[] {
  const problems: string[] = [];
  if (draft.title.trim().length < 5) problems.push("Заглавието е твърде кратко.");
  if (!SLUG_PATTERN.test(draft.slug)) problems.push("Липсва адрес на статията.");
  if (draft.bodyBlocks === 0) problems.push("Текстът е празен.");
  if (!draft.primaryCategoryId) problems.push("Изберете рубрика.");
  if (!draft.heroMediaId) problems.push("Изберете основна снимка.");
  if (draft.authorKind === "manual" && !authorName.safeParse(draft.authorName).success) problems.push("Въведете валидно име на автора.");
  return problems;
}
