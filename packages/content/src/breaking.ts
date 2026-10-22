import { z } from "zod";

export const BREAKING_TEXT_LIMIT = 500;
export const breakingInputSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  enabled: z.boolean(),
  text: z.string().max(2000).transform(value => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(BREAKING_TEXT_LIMIT, "Текстът е до 500 знака.").regex(/^[^\u0000-\u001f\u007f]*$/, "Невалиден текст.")),
  articleId: z.uuid().nullable(),
}).refine(value => !value.enabled || value.text.length > 0, { message: "Въведете текст, преди да включите лентата.", path: ["text"] });

export type BreakingInput = z.infer<typeof breakingInputSchema>;
export { BREAKING_CHANGED, BREAKING_SYNC, breakingVisibleAt, type PublicBreaking } from "./breaking-public";
export interface BreakingSettings {
  ready: boolean; version: number; enabled: boolean; text: string;
  articleId: string | null; articleTitle: string | null;
}
