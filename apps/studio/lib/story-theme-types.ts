/** Public-facing summary used by the Studio list page. */
export interface StoryThemeListItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  isPublished: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  articleCount: number;
  coverUrl: string | null;
}

/** Article in a theme, hydrated for the editor. */
export interface StoryThemeArticleEntry {
  articleId: string;
  position: number;
  title: string;
  path: string;
  categoryName: string | null;
  heroUrl: string | null;
  isPublic: boolean;
  publishedAt: Date | null;
  addedAt: Date;
  addedByName: string | null;
}

/** Full theme loaded for the editor. */
export interface StoryThemeDetail {
  id: string;
  slug: string;
  title: string;
  summary: string;
  intro: string;
  coverMediaId: string | null;
  coverCaption: string;
  coverUrl: string | null;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
  articles: StoryThemeArticleEntry[];
}

export interface StoryThemeInput {
  slug: string;
  title: string;
  summary: string;
  intro: string;
  coverMediaId: string | null;
  coverCaption: string;
}

/** Public article search result (used by article picker). */
export interface StoryThemeArticleSearchResult {
  id: string;
  title: string;
  path: string;
  categoryName: string | null;
  heroUrl: string | null;
  publishedAt: Date | null;
  isPublic: boolean;
}
