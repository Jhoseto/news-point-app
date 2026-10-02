import sanitizeHtml from "sanitize-html";
import { z } from "zod";

// Minimal body format for rendering imported articles (DEC-106). Not the
// future editorial format. Inline HTML is sanitized by the importer; this
// schema is a second line of defence against executable markup.
//
// We use an allowlist (the importer does too). Allowlist is strictly safer
// than a denylist: it is not possible to list every bypass shape
// (`<img/onerror=…>`, `<svg/onload=…>`, `<body/onload=…>`, future attribute-name
// permutations, namespaced tags, etc.), so we keep only what the editorial
// format actually renders and strip everything else. The sanitizer is run at
// schema-validate time so an attacker who ever reached a writer still cannot
// surface executable markup through `dangerouslySetInnerHTML` in the reader.

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "small",
    "a", "span",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "h2", "h3", "h4",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { a: ["http", "https", "mailto"] },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target === "_blank" ? { ...attribs, rel: "noopener noreferrer" } : attribs,
    }),
  },
  disallowedTagsMode: "discard",
};

const sanitize = (value: string): string => sanitizeHtml(value, SANITIZE_OPTIONS);

const safeHtml = z.string().transform(sanitize);

const plainText = z.string().refine((value) => !/[<>]/.test(value), "must be plain text");

export const BODY_VERSION = 1;

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
  size: z.enum(["small", "medium", "large", "full"]).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  shape: z.enum(["rectangle", "rounded", "circle"]).optional(),
  frame: z.enum(["none", "soft", "line"]).optional(),
  groupId: z.string().max(64).optional(),
  focalX: z.number().min(0).max(100).optional(),
  focalY: z.number().min(0).max(100).optional(),
  crop: z.enum(["original", "square", "portrait", "landscape"]).optional(),
  cropZoom: z.number().min(100).max(300).optional(),
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
