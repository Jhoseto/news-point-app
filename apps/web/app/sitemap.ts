import type { MetadataRoute } from "next";
import { and, asc, eq, sql } from "drizzle-orm";
import { articles, categories, getDb } from "@newspoint/db";
import { PUBLIC_MENU } from "@newspoint/content";
import { shareOrigin } from "@/lib/share-card";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = shareOrigin();
  const db = getDb();
  const publicArticle = and(eq(articles.isPublic, true), sql`${articles.publishedAt} <= now()`);
  const stories = await db.select({ path: articles.path, updatedAt: articles.updatedAt }).from(articles).where(publicArticle).orderBy(asc(articles.path)).limit(45000);
  const sections = await db.select({ slug: categories.slug, path: categories.path, name: categories.name }).from(categories).where(eq(categories.kind, "section"));
  const menu = new Set(PUBLIC_MENU.map((entry) => entry.slug));
  return [
    { url: `${origin}/`, changeFrequency: "hourly", priority: 1 },
    ...sections.filter((section) => menu.has(section.slug)).map((section) => ({
      url: `${origin}${section.path}`,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...stories.map((story) => ({
      url: `${origin}${story.path}`,
      lastModified: story.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
