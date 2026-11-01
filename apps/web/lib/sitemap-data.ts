import "server-only";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { articles, categories, getDb, podcasts, publishRequests, storyThemes } from "@newspoint/db";
import { PUBLIC_MENU } from "@newspoint/content";
import { discoverablePublicPages } from "./public-metadata";
import { CAMERA_CATALOG } from "./livepoint/cameras/catalog";
import { NEWS_SITEMAP_PAGE_SIZE, SITEMAP_PAGE_SIZE, type SitemapEntry, type SitemapKind } from "./sitemap-xml";
import { publicArticleModifiedAt } from "./article-dates";

const publishedArticles = () => and(eq(articles.isPublic, true), lte(articles.publishedAt, sql`now()`));
const publishedThemes = () => and(eq(storyThemes.isPublished, true), lte(storyThemes.publishedAt, sql`now()`));
const publishedPodcasts = () => and(eq(podcasts.status, "published"), lte(podcasts.publishedAt, sql`now()`));
const recentNews = () => and(publishedArticles(), sql`${articles.publishedAt} >= now() - interval '2 days'`);

export async function newsSitemapCount(): Promise<number> {
  const [row] = await getDb().select({ count: sql<number>`count(*)::int` }).from(articles).where(recentNews());
  return row!.count;
}

export async function newsSitemapEntries(page: number): Promise<SitemapEntry[]> {
  const rows = await getDb().select({ path: articles.path, title: articles.title, publishedAt: articles.publishedAt })
    .from(articles).where(recentNews()).orderBy(asc(articles.path)).limit(NEWS_SITEMAP_PAGE_SIZE).offset(page * NEWS_SITEMAP_PAGE_SIZE);
  return rows.map((row) => ({ path: row.path, news: { title: row.title, publishedAt: row.publishedAt! } }));
}

export async function sitemapCounts(): Promise<Record<SitemapKind, number>> {
  const db = getDb();
  const [articleRows, themeRows, podcastRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(articles).where(publishedArticles()),
    db.select({ count: sql<number>`count(*)::int` }).from(storyThemes).where(publishedThemes()),
    db.select({ count: sql<number>`count(*)::int` }).from(podcasts).where(publishedPodcasts()),
  ]);
  return { articles: articleRows[0]!.count, themes: themeRows[0]!.count, podcasts: podcastRows[0]!.count };
}

export async function sitemapPages(): Promise<SitemapEntry[]> {
  const sections = await getDb().select({ path: categories.path, slug: categories.slug }).from(categories).where(eq(categories.kind, "section"));
  const menu = new Set(PUBLIC_MENU.map((entry) => entry.slug));
  const paths = [...discoverablePublicPages().map((page) => page.path), ...CAMERA_CATALOG.map((camera) => `/livepoint/cameras/${camera.slug}/`), ...sections.filter((section) => menu.has(section.slug)).map((section) => section.path)];
  return [...new Set(paths)].map((path) => ({ path }));
}

export async function sitemapEntries(kind: SitemapKind, page: number): Promise<SitemapEntry[]> {
  const db = getDb();
  const offset = page * SITEMAP_PAGE_SIZE;
  if (kind === "articles") {
    // Aggregate once for a whole sitemap page; publish_requests is keyed by
    // idempotency, so a correlated lookup per article would repeat table scans.
    const publishedRevisions = db.select({
      articleId: publishRequests.articleId,
      revision: publishRequests.revision,
      publishedRevisionAt: sql<Date | null>`max(${publishRequests.createdAt})`.mapWith(publishRequests.createdAt).as("published_revision_at"),
    }).from(publishRequests).groupBy(publishRequests.articleId, publishRequests.revision).as("published_revisions");
    const rows = await db.select({
      path: articles.path,
      publishedAt: articles.publishedAt,
      sourceModifiedAt: articles.sourceModifiedAt,
      // Match the timestamp displayed by ArticleDetail. Technical row updates,
      // imports and revisions not selected for publication are not content edits.
      publishedRevisionAt: publishedRevisions.publishedRevisionAt,
    }).from(articles)
      .leftJoin(publishedRevisions, and(eq(publishedRevisions.articleId, articles.id), eq(publishedRevisions.revision, articles.publishedRevision)))
      .where(publishedArticles()).orderBy(asc(articles.path)).limit(SITEMAP_PAGE_SIZE).offset(offset);
    return rows.map(row => ({ path: row.path, updatedAt: publicArticleModifiedAt({ ...row, publishedAt: row.publishedAt! }) }));
  }
  if (kind === "themes") {
    const rows = await db.select({ slug: storyThemes.slug, updatedAt: storyThemes.updatedAt }).from(storyThemes).where(publishedThemes()).orderBy(asc(storyThemes.slug)).limit(SITEMAP_PAGE_SIZE).offset(offset);
    return rows.map((row) => ({ path: `/temi/${row.slug}/`, updatedAt: row.updatedAt }));
  }
  const rows = await db.select({ slug: podcasts.slug, updatedAt: podcasts.updatedAt }).from(podcasts).where(publishedPodcasts()).orderBy(asc(podcasts.slug)).limit(SITEMAP_PAGE_SIZE).offset(offset);
  return rows.map((row) => ({ path: `/livepoint/podcast/${row.slug}/`, updatedAt: row.updatedAt }));
}
