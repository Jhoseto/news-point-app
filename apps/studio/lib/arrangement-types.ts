export interface ArrangementArticle {
  id: string;
  title: string;
  categoryName: string | null;
  isPublic: boolean;
}

export interface MenuCategory {
  id: string;
  slug: string;
  name: string;
  path: string;
}

export interface ArrangementHistoryItem {
  id: string;
  publishedAt: string | null;
  note: string;
}
