import { z } from "zod";
import { articleBody } from "./blocks";

export const aiPodcastSettings = z.strictObject({
  articleIds: z.array(z.uuid()).min(3).max(5).refine((ids) => new Set(ids).size === ids.length),
  minutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(25)]),
  style: z.enum(["natural", "serious", "analytical", "dynamic"]),
  introMode: z.enum(["exact", "automatic"]),
  intro: z.string().trim().max(1200),
  direction: z.string().trim().max(1000),
  music: z.enum(["none", "daily", "evening", "breaking", "custom"]),
  categoryId: z.uuid().nullable(),
}).refine((settings) => settings.introMode !== "exact" || settings.intro.length >= 2, "Exact intro is required");

export type AiPodcastSettings = z.infer<typeof aiPodcastSettings>;

export const aiPodcastSource = z.strictObject({
  id: z.uuid(),
  title: z.string().min(1),
  path: z.string().min(1),
  excerpt: z.string(),
  text: z.string().min(1),
  version: z.number().int().positive(),
  publishedRevision: z.number().int().nullable(),
  publishedAt: z.string(),
});
export type AiPodcastSource = z.infer<typeof aiPodcastSource>;

export const aiPodcastLine = z.strictObject({
  speaker: z.enum(["alex", "maya"]),
  text: z.string().trim().min(1).max(2000),
  direction: z.string().trim().max(180).default(""),
});
export type AiPodcastLine = z.infer<typeof aiPodcastLine>;
export const aiPodcastSegment = z.strictObject({
  id: z.uuid(),
  sourceId: z.uuid().nullable(),
  label: z.string().trim().min(1).max(180),
  lines: z.array(aiPodcastLine).min(1).max(100),
  wavKey: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
});
export type AiPodcastSegment = z.infer<typeof aiPodcastSegment>;

export const aiPodcastWarning = z.strictObject({
  segmentId: z.uuid(),
  claim: z.string().min(1),
  reason: z.string().min(1),
  sourceId: z.uuid().nullable(),
  excerpt: z.string().nullable(),
});
export type AiPodcastWarning = z.infer<typeof aiPodcastWarning>;

export function articleText(body: unknown): string {
  const parsed = articleBody.safeParse(body);
  if (!parsed.success) return "";
  return parsed.data.flatMap((block) => {
    if (block.type === "heading") return [block.text];
    if (block.type === "image") return block.caption ? [block.caption] : [];
    if (block.type === "list") return block.items.map(stripHtml);
    if (block.type === "paragraph" || block.type === "quote" || block.type === "legacy_html") return [stripHtml(block.html)];
    return [];
  }).filter(Boolean).join("\n\n");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

export function transcript(segments: AiPodcastSegment[]): string {
  return segments.map((segment) => `${segment.label}\n${segment.lines.map((line) => `${line.speaker === "alex" ? "Алекс" : "Мая"}: ${line.text}`).join("\n")}`).join("\n\n");
}

export function targetWords(settings: AiPodcastSettings): number {
  // Conversational Bulgarian speech is planned around 130 words/minute.
  return Math.round(settings.minutes * 130);
}
