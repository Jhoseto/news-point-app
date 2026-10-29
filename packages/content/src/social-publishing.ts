import { z } from "zod";
import { articleBody } from "./blocks";

export const FACEBOOK_TEXT_MAX = 60_000;
export const INSTAGRAM_TEXT_MAX = 2200;
const instagramInput = z.strictObject({ enabled: z.boolean(), text: z.string().max(INSTAGRAM_TEXT_MAX), textMode: z.enum(["auto", "custom"]) });
export const socialInput = z.strictObject({ facebook: z.strictObject({
  enabled: z.boolean(), text: z.string().max(FACEBOOK_TEXT_MAX), textMode: z.enum(["auto", "custom"]),
}), instagram: instagramInput.optional() });
export type SocialInput = z.infer<typeof socialInput>;
export type InstagramInput = z.infer<typeof instagramInput>;
function plainInstagramBody(body: unknown): string {
  const parsed = articleBody.safeParse(body);
  if (!parsed.success) return "";
  return parsed.data.flatMap(block => {
    if (block.type === "paragraph" || block.type === "quote" || block.type === "legacy_html") return [block.html];
    if (block.type === "list") return block.items;
    return [];
  }).map(html => html.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
}

/** First five editorial sentences, bounded by Instagram's caption limit. */
export function instagramText(title: string, body?: unknown): string {
  const text = plainInstagramBody(body);
  if (!text) return title.trim().slice(0, INSTAGRAM_TEXT_MAX);
  const segments = [...new Intl.Segmenter("bg", { granularity: "sentence" }).segment(text)]
    .map(part => part.segment.trim()).filter(Boolean).slice(0, 5);
  const selected: string[] = [];
  for (const sentence of segments) {
    const candidate = [...selected, sentence].join(" ");
    if (candidate.length > INSTAGRAM_TEXT_MAX) break;
    selected.push(sentence);
  }
  return selected.length ? selected.join(" ") : text.slice(0, INSTAGRAM_TEXT_MAX).trim();
}
export function normalizeInstagram(value: InstagramInput | undefined, title: string, body?: unknown): InstagramInput {
  const input = value ?? { enabled: false, text: "", textMode: "auto" };
  return { ...input, text: input.textMode === "auto" ? instagramText(title, body) : input.text };
}
export const facebookText = (title: string) => `${title}\n\n👇 Четете повече в първия коментар.`;
export const defaultSocial = (title = ""): SocialInput => ({ facebook: { enabled: false, text: facebookText(title), textMode: "auto" } });
export function normalizeSocial(value: SocialInput | undefined, title: string, body?: unknown): SocialInput {
  const social = value ?? defaultSocial(title);
  return { facebook: { ...social.facebook, text: social.facebook.textMode === "auto" ? facebookText(title) : social.facebook.text },
    ...(social.instagram ? { instagram: normalizeInstagram(social.instagram, title, body) } : {}) };
}

export const SOCIAL_ORIGINS = ["https://newspoint.bg", "https://www.newspoint.bg", "https://site44159-izdo3c.scloudsite101.com"] as const;
export function socialOrigin(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return SOCIAL_ORIGINS.includes(url.origin as typeof SOCIAL_ORIGINS[number]) && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}
export function socialArticleUrl(origin: string | undefined, path: string): string | null {
  const base = socialOrigin(origin);
  if (!base || !/^\/[a-z0-9-]+\/$/.test(path)) return null;
  return `${base}${path}`;
}
export type SocialStatus = {
  ready: boolean; connected: boolean; enabled: boolean;
  job: null | { id: string; status: string; step: string; text: string; message: string; canRetry: boolean; url: string | null };
  instagram?: Omit<SocialStatus, "instagram">;
};
export function socialMessage(status: string, step: string, error: string | null): string {
  if (status === "succeeded") return "Facebook: публикувано.";
  if (status === "cancelled") return "Facebook: изпращането е спряно, защото новината не е публична.";
  if (status === "uncertain") return "Facebook: резултатът се проверява. Ако съобщението остане, свържете се с администратора.";
  if (error === "connection") return "Facebook: необходимо е повторно свързване от администратора.";
  if (error === "image") return "Facebook: изберете основна снимка, обновете новината и опитайте отново.";
  if (error === "text") return "Facebook: въведете текст за поста, обновете новината и опитайте отново.";
  if (error === "origin") return "Facebook: администраторът трябва да настрои публичния адрес на сайта.";
  if (status === "failed") return "Facebook: изпращането не успя. Новината остава публикувана в сайта.";
  if (step === "comment" || step === "resolve") return "Facebook: снимката е публикувана, добавянето на линка се повтаря.";
  return "Facebook: изчаква публикуване.";
}
