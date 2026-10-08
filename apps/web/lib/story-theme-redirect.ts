import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { getDb, hasStoryThemeSlugHistory, storyThemeSlugs, storyThemes } from "@newspoint/db";

/** Resolve directly to the current URL, never redirect chains or private themes. */
export async function storyThemeRedirect(slug: string): Promise<string | null> {
  const db = getDb();
  if (!await hasStoryThemeSlugHistory(db)) return null;
  const [theme] = await db.select({ slug: storyThemes.slug }).from(storyThemeSlugs)
    .innerJoin(storyThemes, eq(storyThemes.id, storyThemeSlugs.themeId))
    .where(and(eq(storyThemeSlugs.slug, slug), eq(storyThemes.isPublished, true), lte(storyThemes.publishedAt, sql`now()`))).limit(1);
  return theme && theme.slug !== slug ? `/temi/${theme.slug}/` : null;
}
