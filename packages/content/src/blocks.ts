import { z } from "zod";

// Minimal body format for rendering imported articles (DEC-106). Not the
// future editorial format. Inline HTML is sanitized by the importer; this
// schema is a second line of defence against executable markup.

export const BODY_VERSION = 1;

const EXECUTABLE_MARKUP = /<\s*\/?\s*(script|style|iframe|object|embed|form|input|button|link|meta|base)\b|\son[a-z]+\s*=|javascript:|vbscript:|data:text\/html/i;

const safeHtml = z
  .string()
  .refine((value) => !EXECUTABLE_MARKUP.test(value), "contains executable markup");

const plainText = z.string().refine((value) => !/[<>]/.test(value), "must be plain text");

export const paragraphBlock = z.strictObject({ type: z.literal("paragraph"), html: safeHtml });

export const headingBlock = z.strictObject({
  type: z.literal("heading"),
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  text: plainText,
});

// Images point to a MediaAsset only; a raw URL is not accepted (DEC-104).
export const imageBlock = z.strictObject({
  type: z.literal("image"),
  mediaAssetId: z.uuid(),
  caption: plainText.optional(),
});

export const quoteBlock = z.strictObject({
  type: z.literal("quote"),
  html: safeHtml,
  cite: plainText.optional(),
});

export const listBlock = z.strictObject({
  type: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(safeHtml).min(1),
});

export const embedBlock = z.strictObject({
  type: z.literal("embed"),
  provider: z.enum(["youtube", "facebook", "instagram", "x", "tiktok", "other"]),
  url: z.url({ protocol: /^https$/ }),
});

// Anything the converter does not understand, sanitized, so nothing is lost.
export const legacyHtmlBlock = z.strictObject({ type: z.literal("legacy_html"), html: safeHtml });

export const block = z.discriminatedUnion("type", [
  paragraphBlock,
  headingBlock,
  imageBlock,
  quoteBlock,
  listBlock,
  embedBlock,
  legacyHtmlBlock,
]);

export const articleBody = z.array(block);

export type Block = z.infer<typeof block>;
export type ArticleBody = z.infer<typeof articleBody>;
