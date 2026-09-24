import { z } from "zod";
import { SLUG_MAX, SLUG_PATTERN } from "./slug";

// Shared by the editor form and the API; the API always re-validates.

export const TITLE_MAX = 200;
export const EXCERPT_MAX = 400;
export const BODY_TEXT_MAX = 100_000;

export const draftInput = z.strictObject({
  title: z.string().trim().max(TITLE_MAX),
  slug: z.string().trim().max(SLUG_MAX).refine((value) => value === "" || SLUG_PATTERN.test(value), "Невалиден адрес"),
  excerpt: z.string().trim().max(EXCERPT_MAX),
  bodyText: z.string().max(BODY_TEXT_MAX),
  primaryCategoryId: z.uuid().nullable(),
  heroMediaId: z.uuid().nullable(),
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
}): string[] {
  const problems: string[] = [];
  if (draft.title.trim().length < 5) problems.push("Заглавието е твърде кратко.");
  if (!SLUG_PATTERN.test(draft.slug)) problems.push("Липсва адрес на статията.");
  if (draft.bodyBlocks === 0) problems.push("Текстът е празен.");
  if (!draft.primaryCategoryId) problems.push("Изберете рубрика.");
  if (!draft.heroMediaId) problems.push("Изберете основна снимка.");
  return problems;
}
