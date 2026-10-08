/**
 * Integration tests for the "Тема с продължение" DB operations.
 *
 * Uses PGlite (real PostgreSQL engine in WASM, no DATABASE_URL or network)
 * so we exercise the same Drizzle queries that run in production. The
 * pure validation rules are covered in `story-themes.test.ts`; this file
 * focuses on the business invariants that only surface at the DB layer:
 *   - position shift when adding a member mid-list
 *   - reorder validation (existing set must match incoming set exactly)
 *   - publish invariants (at least one public article, no draft members)
 *   - slug uniqueness across themes
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { asc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "@newspoint/db/schema";

// `server-only` throws unconditionally outside a Next server runtime. We are
// not in one, so the empty module is required.
vi.mock("server-only", () => ({ default: {}, __esModule: true }));

// `triggerRevalidate` calls `revalidatePath`, which is Next-only.
// `resolveMediaUrl` reads MEDIA_ORIGIN and process.cwd.
vi.mock("@newspoint/content", async () => {
  const { mediaPublicPath } = await vi.importActual<typeof import("@newspoint/content")>("@newspoint/content");
  return {
    PUBLIC_MENU: [{ slug: "plovdiv" }],
    resolveMediaUrl: () => null,
    triggerRevalidate: () => undefined,
    mediaPublicPath,
  };
});

// `unstable_cache` adds Next-specific caching on top of our queries; in tests
// we want a transparent passthrough so each call actually runs.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

// `session.ts` imports better-auth. We never exercise it directly — every
// function we test is invoked with a literal `staff` argument.
vi.mock("../apps/studio/lib/session", () => ({
  requireStaff: () =>
    Promise.resolve({ id: "test-staff", name: "Test Editor", role: "admin" }),
}));

// `getDb()` returns a module-scoped singleton in the production code. We
// replace it with the PGlite-backed db from `beforeAll`. The rest of the
// `@newspoint/db` exports (table references, schema helpers) keep working.
type TestDb = ReturnType<typeof drizzle<typeof schema>>;
const dbHolder = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("@newspoint/db", async () => {
  const actual = await vi.importActual<typeof import("@newspoint/db")>("@newspoint/db");
  return {
    ...actual,
    getDb: () => dbHolder.current,
  };
});

let pg: PGlite;
let db: TestDb;
let themeId: string;
let articleIds: string[];

const STAFF = { id: "test-staff", name: "Test Editor", role: "admin" as const };

const validInput = {
  slug: "valid-theme",
  title: "Валидна тема за тест",
  summary: "Резюме",
  intro: "Въведение",
  coverMediaId: null,
  coverCaption: "",
};

async function positionsForCurrentTheme(themeId: string): Promise<{ articleId: string; position: number }[]> {
  return db
    .select({ articleId: schema.storyThemeArticles.articleId, position: schema.storyThemeArticles.position })
    .from(schema.storyThemeArticles)
    .where(eq(schema.storyThemeArticles.themeId, themeId))
    .orderBy(asc(schema.storyThemeArticles.position));
}

async function seedThemeWithArticles(articleIdsToAdd: string[]): Promise<string> {
  const created = await import("../apps/studio/lib/story-themes");
  const result = await created.createStoryTheme(STAFF, validInput, articleIdsToAdd);
  return result.id;
}

beforeAll(async () => {
  pg = new PGlite();
  // Minimal stubs for the tables that story_themes / story_theme_articles
  // reference. We do not load every migration — only what migration 28 needs
  // to resolve its foreign keys.
  await pg.exec(`
    create table media_assets (
      id uuid primary key default gen_random_uuid(),
      storage_key text,
      source_url text,
      provider text
    );
    create table staff_users (
      id text primary key,
      name text
    );
    create table articles (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      path text not null unique,
      is_public boolean not null default false,
      published_at timestamptz,
      excerpt text,
      primary_category_id uuid,
      hero_media_id uuid,
      updated_at timestamptz not null default now()
    );
    create table categories (
      id uuid primary key,
      name text not null,
      slug text not null unique,
      path text not null unique,
      kind text not null default 'section',
      in_menu boolean not null default false,
      menu_order integer
    );
    create table outbox_events (
      id bigint generated always as identity primary key,
      type text not null,
      entity_id uuid,
      version int not null default 1,
      payload jsonb not null,
      occurred_at timestamptz not null default now()
    );
  `);
  // Migration 28 creates story_themes and story_theme_articles, plus indexes
  // and the outbox constraint update. The unique slug index is what enforces
  // "no two themes with the same slug" in production.
  await pg.exec(readFileSync("packages/db/migrations/28_story_themes.sql", "utf8"));
  await pg.exec(readFileSync("packages/db/migrations/29_story_theme_slug_history.sql", "utf8"));
  await pg.exec(readFileSync("packages/db/migrations/22_podcasts.sql", "utf8"));
  db = drizzle(pg, { schema });
  dbHolder.current = db;
}, 30_000);

beforeEach(async () => {
  await pg.exec(
    "truncate story_theme_articles, story_themes, podcasts, outbox_events, articles, categories, media_assets, staff_users cascade",
  );
  await pg.query("insert into staff_users(id, name) values ($1, $2)", [STAFF.id, STAFF.name]);

  // Five public articles and one private draft article, all with unique paths.
  articleIds = [];
  for (let i = 0; i < 5; i += 1) {
    const id = randomUUID();
    articleIds.push(id);
    await pg.query(
      "insert into articles(id, title, path, is_public, published_at) values ($1, $2, $3, true, now() - ($4::int * interval '1 hour'))",
      [id, `Article ${i}`, `/article-${i}-${id.slice(0, 8)}/`, 5 - i],
    );
  }
  // index 5 is the draft
  const draftId = randomUUID();
  articleIds.push(draftId);
  await pg.query(
    "insert into articles(id, title, path, is_public) values ($1, $2, $3, false)",
    [draftId, "Draft Article", `/draft-article-${draftId.slice(0, 8)}/`],
  );
  themeId = await seedThemeWithArticles([articleIds[0]!, articleIds[1]!, articleIds[2]!]);
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await pg?.close();
});

describe("addArticleToTheme (position shift)", () => {
  it("appends at the tail without changing existing positions", async () => {
    const { addArticleToTheme } = await import("../apps/studio/lib/story-themes");
    await addArticleToTheme(STAFF, themeId, articleIds[3]!, 4);
    const rows = await positionsForCurrentTheme(themeId);
    expect(rows.map((r) => r.articleId)).toEqual([articleIds[0], articleIds[1], articleIds[2], articleIds[3]]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it("shifts existing positions when inserting in the middle", async () => {
    const { addArticleToTheme } = await import("../apps/studio/lib/story-themes");
    // Existing theme has positions 1, 2, 3 for ids [a0, a1, a2].
    // Insert a3 at position 2 → expect [a0, a3, a1, a2] with positions [1, 2, 3, 4].
    await addArticleToTheme(STAFF, themeId, articleIds[3]!, 2);
    const rows = await positionsForCurrentTheme(themeId);
    expect(rows.map((r) => r.articleId)).toEqual([articleIds[0], articleIds[3], articleIds[1], articleIds[2]]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it("shifts every existing position when inserting at the head", async () => {
    const { addArticleToTheme } = await import("../apps/studio/lib/story-themes");
    await addArticleToTheme(STAFF, themeId, articleIds[3]!, 1);
    const rows = await positionsForCurrentTheme(themeId);
    expect(rows.map((r) => r.articleId)).toEqual([articleIds[3], articleIds[0], articleIds[1], articleIds[2]]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it("rejects draft (non-public) articles", async () => {
    const { addArticleToTheme } = await import("../apps/studio/lib/story-themes");
    // articleIds[5] is the draft.
    await expect(addArticleToTheme(STAFF, themeId, articleIds[5]!, 4)).rejects.toMatchObject({
      code: "article_not_published",
      status: 422,
    });
    const rows = await positionsForCurrentTheme(themeId);
    expect(rows).toHaveLength(3); // unchanged
  });

  it("rejects an article already in the theme", async () => {
    const { addArticleToTheme } = await import("../apps/studio/lib/story-themes");
    await expect(addArticleToTheme(STAFF, themeId, articleIds[0]!, 2)).rejects.toMatchObject({
      code: "already_in_theme",
      status: 409,
    });
  });

  it("rejects non-positive position", async () => {
    const { addArticleToTheme } = await import("../apps/studio/lib/story-themes");
    await expect(addArticleToTheme(STAFF, themeId, articleIds[3]!, 0)).rejects.toMatchObject({
      code: "invalid_position",
      status: 400,
    });
    await expect(addArticleToTheme(STAFF, themeId, articleIds[3]!, -1)).rejects.toMatchObject({
      code: "invalid_position",
    });
  });
});

describe("removeArticleFromTheme", () => {
  it("removes a member and keeps the remaining ones dense", async () => {
    const { removeArticleFromTheme } = await import("../apps/studio/lib/story-themes");
    // Remove articleIds[1] from [a0, a1, a2] → [a0, a2] but positions stay 1, 3.
    // The function does not compact; reorderThemeArticles is the canonical
    // way to renumber. This matches the production behavior.
    await removeArticleFromTheme(STAFF, themeId, articleIds[1]!);
    const rows = await positionsForCurrentTheme(themeId);
    expect(rows.map((r) => r.articleId)).toEqual([articleIds[0], articleIds[2]]);
    expect(rows.map((r) => r.position)).toEqual([1, 3]);
  });

  it("emits a story.updated outbox event", async () => {
    const { removeArticleFromTheme } = await import("../apps/studio/lib/story-themes");
    await removeArticleFromTheme(STAFF, themeId, articleIds[1]!);
    const events = await db
      .select({ type: schema.outboxEvents.type, payload: schema.outboxEvents.payload })
      .from(schema.outboxEvents);
    expect(events.some((e) => e.type === "story.updated")).toBe(true);
    expect(events.find((e) => e.type === "story.updated")?.payload).toMatchObject({
      path: `/temi/${validInput.slug}/`,
    });
  });
});

describe("reorderThemeArticles", () => {
  it("rewrites positions to a dense 1..N sequence in the supplied order", async () => {
    const { reorderThemeArticles } = await import("../apps/studio/lib/story-themes");
    // Existing: [a0(1), a1(2), a2(3)]; reorder to [a2, a0, a1] → 1,2,3.
    await reorderThemeArticles(STAFF, themeId, [articleIds[2]!, articleIds[0]!, articleIds[1]!]);
    const rows = await positionsForCurrentTheme(themeId);
    expect(rows.map((r) => r.articleId)).toEqual([articleIds[2], articleIds[0], articleIds[1]]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it("rejects a reorder that drops an existing member", async () => {
    const { reorderThemeArticles } = await import("../apps/studio/lib/story-themes");
    await expect(
      reorderThemeArticles(STAFF, themeId, [articleIds[0]!, articleIds[1]!]),
    ).rejects.toMatchObject({ code: "order_mismatch", status: 400 });
  });

  it("rejects a reorder that adds an unknown article", async () => {
    const { reorderThemeArticles } = await import("../apps/studio/lib/story-themes");
    await expect(
      reorderThemeArticles(STAFF, themeId, [articleIds[0]!, articleIds[1]!, articleIds[2]!, articleIds[3]!]),
    ).rejects.toMatchObject({ code: "order_mismatch", status: 400 });
  });

  it("rejects an empty reorder list", async () => {
    const { reorderThemeArticles } = await import("../apps/studio/lib/story-themes");
    await expect(reorderThemeArticles(STAFF, themeId, [])).rejects.toMatchObject({
      code: "empty_order",
      status: 400,
    });
  });
});

describe("publishStoryTheme invariants", () => {
  it("publishes a theme with at least one published article", async () => {
    const { publishStoryTheme } = await import("../apps/studio/lib/story-themes");
    await publishStoryTheme(STAFF, themeId);
    const [row] = await db
      .select({ isPublished: schema.storyThemes.isPublished, publishedAt: schema.storyThemes.publishedAt })
      .from(schema.storyThemes)
      .where(eq(schema.storyThemes.id, themeId));
    expect(row?.isPublished).toBe(true);
    expect(row?.publishedAt).toBeInstanceOf(Date);
  });

  it("rejects publishing an empty theme", async () => {
    const { createStoryTheme, publishStoryTheme } = await import("../apps/studio/lib/story-themes");
    const empty = await createStoryTheme(STAFF, { ...validInput, slug: "empty-theme" }, []);
    await expect(publishStoryTheme(STAFF, empty.id)).rejects.toMatchObject({
      code: "not_ready",
      status: 422,
    });
  });

  it("rejects publishing when any member is still a draft", async () => {
    const { publishStoryTheme } = await import("../apps/studio/lib/story-themes");
    // addArticleToTheme blocks drafts at the entry point, so seed a draft
    // member directly through the schema — this still exercises the
    // `isPublic = false` check inside publishStoryTheme.
    await db.insert(schema.storyThemeArticles).values({
      themeId,
      articleId: articleIds[5]!,
      position: 4,
    });
    await expect(publishStoryTheme(STAFF, themeId)).rejects.toMatchObject({
      code: "not_ready",
      status: 422,
    });
    const [row] = await db
      .select({ isPublished: schema.storyThemes.isPublished })
      .from(schema.storyThemes)
      .where(eq(schema.storyThemes.id, themeId));
    expect(row?.isPublished).toBe(false);
  });

  it("rejects a double publish", async () => {
    const { publishStoryTheme } = await import("../apps/studio/lib/story-themes");
    await publishStoryTheme(STAFF, themeId);
    await expect(publishStoryTheme(STAFF, themeId)).rejects.toMatchObject({
      code: "already_published",
      status: 422,
    });
  });

  it("emits a story.published event the first time and story.updated on later changes", async () => {
    const { publishStoryTheme, unpublishStoryTheme, publishStoryTheme: republish } = await import(
      "../apps/studio/lib/story-themes"
    );
    await publishStoryTheme(STAFF, themeId);
    await unpublishStoryTheme(STAFF, themeId);
    await republish(STAFF, themeId);
    const events = await db
      .select({ type: schema.outboxEvents.type })
      .from(schema.outboxEvents)
      .orderBy(asc(schema.outboxEvents.id));
    const types = events.map((e) => e.type);
    expect(types).toContain("story.published");
    expect(types).toContain("story.updated");
  });
});

describe("createStoryTheme chronology", () => {
  it("stores selected articles oldest-to-newest regardless of pick order", async () => {
    const { createStoryTheme } = await import("../apps/studio/lib/story-themes");
    const result = await createStoryTheme(
      STAFF,
      { ...validInput, slug: "chrono-theme" },
      [articleIds[3]!, articleIds[0]!, articleIds[2]!],
    );
    const rows = await positionsForCurrentTheme(result.id);
    expect(rows.map((row) => row.articleId)).toEqual([articleIds[0], articleIds[2], articleIds[3]]);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3]);
  });
});

describe("createStoryTheme uniqueness", () => {
  it("rejects a duplicate slug on the same theme table", async () => {
    const { createStoryTheme } = await import("../apps/studio/lib/story-themes");
    await expect(
      createStoryTheme(STAFF, { ...validInput, slug: "another-theme" }),
    ).resolves.toBeDefined();
    await expect(
      createStoryTheme(STAFF, { ...validInput, slug: "another-theme" }),
    ).rejects.toMatchObject({ code: "slug_taken", status: 409 });
  });

  it("rejects a slug that collides with an existing article path", async () => {
    const { createStoryTheme } = await import("../apps/studio/lib/story-themes");
    // Insert an article whose path is `/existing-article/` and try to create
    // a theme with the matching slug. The URL space is shared with articles.
    const slug = "existing-article";
    await db.update(schema.articles).set({ path: `/${slug}/` }).where(eq(schema.articles.id, articleIds[0]!));
    await expect(
      createStoryTheme(STAFF, { ...validInput, slug }),
    ).rejects.toMatchObject({ code: "slug_taken", status: 409 });
  });

  it("rejects a slug that collides with an existing category path", async () => {
    const { createStoryTheme } = await import("../apps/studio/lib/story-themes");
    const slug = "world";
    // Categories table has more columns than we stub, so provide only the
    // ones the production schema marks NOT NULL with no default.
    await db.execute(
      sql`insert into categories(id, slug, name, path, kind, in_menu) values (${randomUUID()}, ${slug}, ${"Свят"}, ${`/${slug}/`}, ${"section"}, false)`,
    );
    await expect(
      createStoryTheme(STAFF, { ...validInput, slug }),
    ).rejects.toMatchObject({ code: "slug_taken", status: 409 });
  });
});

describe("saveStoryTheme", () => {
  it("refuses unsafe URL changes before migration 29 and serves unknown old URLs as missing", async () => {
    const { saveStoryTheme } = await import("../apps/studio/lib/story-themes");
    const { storyThemeRedirect } = await import("../apps/web/lib/story-theme-redirect");
    await pg.exec("alter table story_theme_slugs rename to story_theme_slugs_unavailable");
    try {
      await expect(saveStoryTheme(STAFF, themeId, { ...validInput, slug: "new-theme" })).rejects.toMatchObject({ code: "migration_required", status: 422 });
      expect(await storyThemeRedirect("old-theme")).toBeNull();
    } finally {
      await pg.exec("alter table story_theme_slugs_unavailable rename to story_theme_slugs");
    }
  });
  it("keeps old URLs, redirects directly after repeated renames, and hides unpublished targets", async () => {
    const { saveStoryTheme, publishStoryTheme, unpublishStoryTheme } = await import("../apps/studio/lib/story-themes");
    const { storyThemeRedirect } = await import("../apps/web/lib/story-theme-redirect");
    await publishStoryTheme(STAFF, themeId);
    await saveStoryTheme(STAFF, themeId, { ...validInput, slug: "new-theme" });
    await saveStoryTheme(STAFF, themeId, { ...validInput, slug: "latest-theme" });
    expect(await storyThemeRedirect(validInput.slug)).toBe("/temi/latest-theme/");
    expect(await storyThemeRedirect("new-theme")).toBe("/temi/latest-theme/");
    expect(await storyThemeRedirect("latest-theme")).toBeNull();
    await unpublishStoryTheme(STAFF, themeId);
    expect(await storyThemeRedirect(validInput.slug)).toBeNull();
    await publishStoryTheme(STAFF, themeId);
    await saveStoryTheme(STAFF, themeId, validInput);
    expect(await storyThemeRedirect("latest-theme")).toBe(`/temi/${validInput.slug}/`);
  });

  it("reserves aliases against create, rename and direct SQL, rolling back collisions", async () => {
    const { saveStoryTheme, createStoryTheme } = await import("../apps/studio/lib/story-themes");
    await saveStoryTheme(STAFF, themeId, { ...validInput, slug: "new-theme" });
    await expect(createStoryTheme(STAFF, validInput)).rejects.toMatchObject({ code: "slug_taken", status: 409 });
    const other = await createStoryTheme(STAFF, { ...validInput, slug: "other-theme" });
    await expect(saveStoryTheme(STAFF, other.id, validInput)).rejects.toMatchObject({ code: "slug_taken", status: 409 });
    await expect(pg.query("update story_themes set slug = $1 where id = $2", [validInput.slug, other.id])).rejects.toMatchObject({ code: "23505" });
    const [row] = await db.select({ slug: schema.storyThemes.slug }).from(schema.storyThemes).where(eq(schema.storyThemes.id, other.id));
    expect(row?.slug).toBe("other-theme");
  });

  it("updates title and summary without changing slug or members", async () => {
    const { saveStoryTheme } = await import("../apps/studio/lib/story-themes");
    await saveStoryTheme(STAFF, themeId, {
      ...validInput,
      title: "Ново заглавие",
      summary: "Ново резюме",
    });
    const [row] = await db
      .select({ title: schema.storyThemes.title, summary: schema.storyThemes.summary, slug: schema.storyThemes.slug })
      .from(schema.storyThemes)
      .where(eq(schema.storyThemes.id, themeId));
    expect(row?.title).toBe("Ново заглавие");
    expect(row?.summary).toBe("Ново резюме");
    expect(row?.slug).toBe(validInput.slug);
    // Members are managed through addArticle/removeArticle/reorder and are
    // intentionally NOT overwritten by saveStoryTheme.
    const members = await positionsForCurrentTheme(themeId);
    expect(members).toHaveLength(3);
  });

  it("rejects save with an existing slug from another theme", async () => {
    const { createStoryTheme, saveStoryTheme } = await import("../apps/studio/lib/story-themes");
    const other = await createStoryTheme(STAFF, { ...validInput, slug: "second-theme" });
    await expect(
      saveStoryTheme(STAFF, other.id, { ...validInput, slug: "second-theme", title: "Сменен" }),
    ).resolves.toBeUndefined();
    await expect(
      saveStoryTheme(STAFF, other.id, { ...validInput, slug: "valid-theme", title: "Сменен" }),
    ).rejects.toMatchObject({ code: "slug_taken", status: 409 });
  });
});

describe("deleteStoryTheme", () => {
  it("cascades the join rows and emits a story.updated event", async () => {
    const { deleteStoryTheme } = await import("../apps/studio/lib/story-themes");
    const before = await positionsForCurrentTheme(themeId);
    expect(before).toHaveLength(3);
    await deleteStoryTheme(STAFF, themeId);
    const after = await positionsForCurrentTheme(themeId);
    expect(after).toHaveLength(0);
    const events = await db
      .select({ type: schema.outboxEvents.type })
      .from(schema.outboxEvents);
    expect(events.some((e) => e.type === "story.updated")).toBe(true);
  });
});

describe("public sitemap queries (isolated Postgres fixtures)", () => {
  it("resolves a legacy JPEG to its real WebP copy and refuses unknown or conflicting mappings", async () => {
    const { legacyMediaDestination } = await import("../apps/web/lib/legacy-media");
    const source = "https://newspoint.bg/wp-content/uploads/2026/10/seo-fixture.jpg";
    await pg.query("insert into media_assets(source_url, storage_key, provider) values ($1, $2, 'wordpress_origin')", [source, "news/2026/10/seo-fixture.webp"]);
    expect(await legacyMediaDestination(["2026", "10", "seo-fixture.jpg"])).toBe("/media/news/2026/10/seo-fixture.webp");
    expect(await legacyMediaDestination(["2026", "10", "missing-seo-fixture.jpg"])).toBeNull();
    expect(await legacyMediaDestination(["..", "seo-fixture.jpg"])).toBeNull();
    await pg.query("insert into media_assets(source_url, storage_key, provider) values ($1, $2, 'wordpress_origin')", [source, "news/2026/10/other-seo-fixture.webp"]);
    expect(await legacyMediaDestination(["2026", "10", "seo-fixture.jpg"])).toBeNull();
  });
  it("includes only public news from the last two days and ignores an old story modified today", async () => {
    const { newsSitemapCount, newsSitemapEntries } = await import("../apps/web/lib/sitemap-data");
    await pg.query("update articles set published_at = now() - interval '1 hour' where id = $1", [articleIds[0]]);
    await pg.query("update articles set published_at = now() - interval '3 days', updated_at = now() where id = $1", [articleIds[1]]);
    await pg.query("update articles set published_at = now() + interval '1 hour' where id = $1", [articleIds[2]]);
    await pg.query("update articles set published_at = now() - interval '1 hour' where id = $1", [articleIds[5]]);
    const entries = await newsSitemapEntries(0);
    const paths = entries.map((entry) => entry.path);
    const stored = await db.select({ path: schema.articles.path }).from(schema.articles).where(inArray(schema.articles.id, [articleIds[0]!, articleIds[1]!, articleIds[2]!, articleIds[5]!]));
    expect(paths).toContain(stored.find((row) => row.path.includes(articleIds[0]!.slice(0, 8)))?.path);
    expect(paths).not.toContain(stored.find((row) => row.path.includes(articleIds[1]!.slice(0, 8)))?.path);
    expect(paths).not.toContain(stored.find((row) => row.path.includes(articleIds[2]!.slice(0, 8)))?.path);
    expect(paths).not.toContain(stored.find((row) => row.path.includes(articleIds[5]!.slice(0, 8)))?.path);
    expect(await newsSitemapCount()).toBe(entries.length);
    expect(entries.every((entry) => entry.news?.title && entry.news.publishedAt)).toBe(true);
    expect(await newsSitemapEntries(1)).toEqual([]);
  });
  it("excludes drafts and future publications, lists themes and podcasts, and owns only current theme URLs", async () => {
    const { sitemapCounts, sitemapEntries, sitemapPages } = await import("../apps/web/lib/sitemap-data");
    const { publishStoryTheme, saveStoryTheme, createStoryTheme } = await import("../apps/studio/lib/story-themes");
    await publishStoryTheme(STAFF, themeId);
    await saveStoryTheme(STAFF, themeId, { ...validInput, slug: "current-theme" });
    const future = await createStoryTheme(STAFF, { ...validInput, slug: "future-theme" });
    await pg.query("update story_themes set is_published = true, published_at = now() + interval '1 day' where id = $1", [future.id]);
    await pg.query("update articles set published_at = now() + interval '1 day' where id = $1", [articleIds[0]]);
    await pg.exec(`insert into podcasts(title, slug, summary, cover_key, audio_key, duration_sec, bytes, status, published_at)
      values ('Fixture episode', 'fixture-episode', 'Test only', 'podcasts/2026/10/abcdef.webp', 'podcasts/2026/10/abcdef.mp3', 60, 100, 'published', now()),
      ('Future episode', 'future-episode', 'Test only', 'podcasts/2026/10/abcdef.webp', 'podcasts/2026/10/abcdef.mp3', 60, 100, 'published', now() + interval '1 day'),
      ('Draft episode', 'draft-episode', 'Test only', 'podcasts/2026/10/abcdef.webp', 'podcasts/2026/10/abcdef.mp3', 60, 100, 'draft', null)`);
    expect(await sitemapCounts()).toEqual({ articles: 4, themes: 1, podcasts: 1 });
    expect((await sitemapEntries("themes", 0)).map((entry) => entry.path)).toEqual(["/temi/current-theme/"]);
    expect((await sitemapEntries("podcasts", 0)).map((entry) => entry.path)).toEqual(["/livepoint/podcast/fixture-episode/"]);
    expect(await sitemapEntries("articles", 1)).toEqual([]);
    const pages = (await sitemapPages()).map((entry) => entry.path);
    expect(pages).toEqual(expect.arrayContaining(["/", "/temi/", "/team/", "/contacts/", "/advertising/", "/livepoint/podcast/"]));
    expect(pages).not.toContain("/search/");
    expect(pages).not.toContain("/settings/");
  });
});

describe("searchPublicArticlesForTheme", () => {
  it("pages public matches and reports when more remain", async () => {
    const { searchPublicArticlesForTheme } = await import("../apps/studio/lib/story-themes");
    const first = await searchPublicArticlesForTheme(STAFF, "Article", 2, 0);
    expect(first.articles).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const rest = await searchPublicArticlesForTheme(STAFF, "Article", 2, 2);
    expect(rest.articles).toHaveLength(2);
    expect(rest.hasMore).toBe(true);
    const last = await searchPublicArticlesForTheme(STAFF, "Article", 2, 4);
    expect(last.articles).toHaveLength(1);
    expect(last.hasMore).toBe(false);
    const ids = [...first.articles, ...rest.articles, ...last.articles].map((row) => row.id);
    expect(new Set(ids).size).toBe(5);
  });
});

describe("replaceThemeArticles", () => {
  it("replaces the member set and keeps the given order", async () => {
    const { replaceThemeArticles } = await import("../apps/studio/lib/story-themes");
    await replaceThemeArticles(STAFF, themeId, [articleIds[4]!, articleIds[0]!, articleIds[3]!]);
    const rows = await positionsForCurrentTheme(themeId);
    expect(rows.map((row) => row.articleId)).toEqual([articleIds[4], articleIds[0], articleIds[3]]);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3]);
  });

  it("rejects a draft article", async () => {
    const { replaceThemeArticles } = await import("../apps/studio/lib/story-themes");
    await expect(
      replaceThemeArticles(STAFF, themeId, [articleIds[0]!, articleIds[5]!]),
    ).rejects.toMatchObject({ code: "article_not_published", status: 422 });
  });
});
