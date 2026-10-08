import { z } from "zod";
import { articleBody, embedFrameUrl, publicationProblems } from "@newspoint/content";
import { SLUG_PATTERN, SLUG_STORED_MAX } from "./slug";

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
    slug: z
      .string()
      .trim()
      .max(SLUG_STORED_MAX, `Адресът е до ${SLUG_STORED_MAX} знака`)
      .refine((value) => value === "" || SLUG_PATTERN.test(value), "Невалиден адрес"),
    excerpt: z.string().trim().max(EXCERPT_MAX),
    bodyText: z.string().max(BODY_TEXT_MAX).optional(),
    body: articleBody.refine(value => JSON.stringify(value).length <= BODY_TEXT_MAX, "Материалът е твърде голям").optional(),
    creationId: z.uuid().optional(),
    listenEnabled: z.boolean().optional(),
    primaryCategoryId: z.uuid().nullable(),
    heroMediaId: z.uuid().nullable(),
    heroEmbedUrl: z.string().refine(value => !!embedFrameUrl(value), "Неподдържан водещ embed").nullable().optional(),
    authorKind: z.enum(["staff", "newsroom", "manual"]),
    authorUserId: z.string().min(1).nullable(),
    authorName,
    viewSeed: z.number().int().min(0).max(100_000_000).nullable().optional(),
    viewEvery: z.number().int().min(1).max(100_000).nullable().optional(),
    viewUnit: z.enum(["seconds", "minutes", "hours"]).optional(),
    viewTarget: z.number().int().min(0).max(100_000_000).nullable().optional(),
    publishAtSofia: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional(),
  })
  .superRefine((draft, context) => {
    if ((draft.body === undefined) === (draft.bodyText === undefined)) {
      context.addIssue({ code: "custom", path: ["body"], message: "Подайте body или bodyText, но не и двете" });
    }
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
  listenEnabled: z.boolean(),
});

/** What still blocks publication, in the editor's language. Empty means ready. */
export const publishProblems = publicationProblems;
