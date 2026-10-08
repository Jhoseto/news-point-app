import { z } from "zod";
import { focalPointSchema, imageVariantsSchema } from "@newspoint/content";
import type { ArticleSummary } from "./queries";

const path = z.string().max(1200).refine(value => value.startsWith("/") && !value.startsWith("//") && !/[?#\\]/.test(value));
const text = z.string().max(4000);
const category = z.object({ id: z.string().min(1).max(80), slug: z.string().max(200), name: text, path }).strict();
const media = z.object({ url: z.string().max(2048).refine(value => value.startsWith("/media/") || /^https:\/\//.test(value)),
  width: z.number().finite().nullable(), height: z.number().finite().nullable(), alt: text, caption: text, credit: text,
  variants: imageVariantsSchema.optional(), focalPoint: focalPointSchema.nullable().optional() }).strict();
const article = z.object({ id: z.string().min(1).max(80), path, title: text, excerpt: text, authorName: text,
  publishedAt: z.iso.datetime(), category: category.nullable(), hero: media.nullable() }).strict();
const articles = z.array(article).max(50);
const section = z.object({ category, articles, layout: z.enum(["grid", "feature", "list"]), wide: z.boolean() }).strict();
const poll = z.object({ id: z.string().max(80), question: text, description: text, startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(), open: z.boolean(), adjusted: z.boolean(), total: z.number().int().nonnegative(),
  options: z.array(z.object({ id: z.string().max(80), label: text, count: z.number().int().nonnegative(), percent: z.number().min(0).max(100) }).strict()).max(6) }).strict();
const home = z.object({ kind: z.literal("home"), hero: article.nullable(), support: articles, main: z.array(section).max(24),
  aside: z.array(section).max(24), focusCarousel: articles, topicsCarousel: articles, voiceCarousel: articles, poll: poll.nullable() }).strict();
const rubric = z.object({ kind: z.literal("category"), category, articles, previous: path.nullable(), next: path.nullable(), anchored: z.boolean() }).strict();
export const mobileRubricFeedSchema = z.object({ schemaVersion: z.literal(1), canonicalPath: path,
  menuVersion: z.string().max(80), contentVersion: z.string().max(80), asOfMs: z.number().int().nonnegative(),
  freshUntil: z.number().int().nonnegative(), feed: z.discriminatedUnion("kind", [home, rubric]) }).strict();
export type MobileRubricFeed = z.infer<typeof mobileRubricFeedSchema>;
export type MobileFeedContent = MobileRubricFeed["feed"];
function slimHero(hero: NonNullable<ArticleSummary["hero"]>): z.infer<typeof media> {
  // Keep at most two smallest width variants so LCP/srcset still work without
  // shipping the full variant list in the embedded pager JSON.
  const variants = Array.isArray(hero.variants)
    ? [...hero.variants].sort((a, b) => a.width - b.width).slice(0, 2)
    : [];
  return {
    url: hero.url,
    width: hero.width,
    height: hero.height,
    alt: hero.alt,
    caption: "",
    credit: "",
    ...(variants.length ? { variants } : {}),
    ...(hero.focalPoint != null ? { focalPoint: hero.focalPoint } : {}),
  };
}

export function serializeFeedArticle(value: ArticleSummary): z.infer<typeof article> {
  // Explicit public projection: never serialize embeds, bodies, pools or editorial fields.
  return {
    id: value.id,
    path: value.path,
    title: value.title,
    excerpt: value.excerpt,
    authorName: value.authorName,
    publishedAt: value.publishedAt.toISOString(),
    category: value.category,
    hero: value.hero ? slimHero(value.hero) : null,
  };
}
export function reviveFeedArticle(value: z.infer<typeof article>): ArticleSummary {
  const { hero, ...rest } = value;
  return { ...rest, publishedAt: new Date(value.publishedAt), hero: hero ? {
    url: hero.url, width: hero.width, height: hero.height, alt: hero.alt, caption: hero.caption, credit: hero.credit,
    ...(hero.variants ? { variants: hero.variants } : {}), ...(hero.focalPoint !== undefined ? { focalPoint: hero.focalPoint } : {}),
  } : null };
}
