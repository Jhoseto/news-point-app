import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "@newspoint/db/schema";
import { articleImageAttrs } from "../apps/web/lib/article-image";
import { storyThemeImage } from "../apps/web/lib/story-theme-image";

const holder = vi.hoisted(() => ({ db: null as ReturnType<typeof drizzle<typeof schema>> | null }));
vi.mock("@newspoint/db", async () => ({
  ...await vi.importActual<typeof import("@newspoint/db")>("@newspoint/db"),
  getDb: () => holder.db,
  // PGlite wraps raw-query rows; postgres-js (used by the readiness helper) returns the array.
  hasMediaPresentations: async () => (await holder.db!.execute<{ available: boolean }>(
    sql`select to_regclass('public.media_presentations') is not null as available`,
  )).rows[0]?.available === true,
}));
vi.mock("@newspoint/content", async () => ({
  ...await vi.importActual<typeof import("@newspoint/content")>("@newspoint/content"),
  resolveMediaUrl: ({ storageKey }: { storageKey: string }) => `/media/${storageKey}`,
}));
vi.mock("../apps/web/node_modules/next/cache.js", () => ({ unstable_cache: (fn: unknown) => fn }));

let pg: PGlite | undefined;
afterEach(async () => { await pg?.close(); });

async function seed(presentations: boolean) {
  pg = new PGlite();
  await pg.exec(`
    create table media_assets (id uuid primary key, storage_key text, source_url text, provider text, width integer, height integer);
    create table categories (id uuid primary key, name text, slug text, path text);
    create table articles (id uuid primary key, title text, path text, is_public boolean, published_at timestamptz, primary_category_id uuid, hero_media_id uuid);
    create table story_themes (id uuid primary key, slug text, title text, summary text, intro text, cover_media_id uuid, cover_caption text, published_at timestamptz, is_published boolean);
    create table story_theme_articles (theme_id uuid, article_id uuid, position integer);
    ${presentations ? "create table media_presentations (media_asset_id uuid primary key, variants jsonb, focal_x real, focal_y real);" : ""}
  `);
  holder.db = drizzle(pg, { schema });
  const theme = randomUUID();
  const image = randomUUID();
  await pg.query("insert into story_themes values ($1, 'fixture', 'Fixture theme', '', '', null, '', now() - interval '1 day', true)", [theme]);
  await pg.query("insert into media_assets values ($1, 'news/fixture.webp', null, 'object_storage', 2400, 1200)", [image]);
  const variants = [320, 480, 768, 960, 1440, 1920].map(width => ({ url: `/media/news/fixture-w${width}.webp`, width, height: width / 2 }));
  if (presentations) await pg.query("insert into media_presentations values ($1, $2, 0.1, 0.9)", [image, JSON.stringify(variants)]);
  for (const [index, visibility] of ["public", "public", "draft", "future"].entries()) {
    const id = randomUUID();
    await pg.query("insert into articles values ($1, $2, $3, $4, now() + ($5::int * interval '1 day'), null, $6)",
      [id, `Fixture ${index}`, `/fixture-${index}/`, visibility !== "draft", visibility === "future" ? 1 : -1, index === 1 ? null : image]);
    await pg.query("insert into story_theme_articles values ($1, $2, $3)", [theme, id, index + 1]);
  }
  return variants;
}

describe("public theme image metadata through actual SQL", () => {
  it("carries six variants to the rendered image candidates without exposing drafts or changing crop", async () => {
    const variants = await seed(true);
    const { getStoryThemeBySlug } = await import("../apps/web/lib/queries");
    const result = await getStoryThemeBySlug("fixture");
    expect(result?.articles.map(a => a.path)).toEqual(["/fixture-0/", "/fixture-1/"]);
    const article = result!.articles[0]!;
    expect(article.heroUrl).toBe("/media/news/fixture.webp");
    expect(article.heroImage).toEqual({ width: 2400, height: 1200, variants });
    const media = storyThemeImage(article)!;
    expect(media.focalPoint).toBeUndefined(); // The existing centered crop is intentional here.
    const attrs = articleImageAttrs(media, { sizes: "84px" });
    expect(attrs.src).toBe("/media/news/fixture-w320.webp");
    expect(attrs.srcSet).toContain("320w");
    expect(attrs.srcSet).toContain("960w");
    expect(storyThemeImage(result!.articles[1]!)).toBeNull();
  }, 30000);

  it("still serves themes before the optional presentation table is available", async () => {
    await seed(false);
    const { getStoryThemeBySlug } = await import("../apps/web/lib/queries");
    const result = await getStoryThemeBySlug("fixture");
    const media = storyThemeImage(result!.articles[0]!)!;
    expect(media.url).toBe("/media/news/fixture.webp");
    expect(media.variants).toEqual([]);
    expect(articleImageAttrs(media, { sizes: "84px" })).toEqual({ src: media.url, sizes: "84px" });
    expect(result?.articles).toHaveLength(2);
  }, 30000);
});
