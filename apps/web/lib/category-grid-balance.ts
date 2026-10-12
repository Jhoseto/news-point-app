import { categoryCursorUrl, type CategoryCursor } from "./category-pagination";

/** Desktop rubric grid fills four columns at the widest breakpoint. */
export const CATEGORY_GRID_COLS = 4;

export function categoryGridOrphanCount(articleCount: number): number {
  if (articleCount <= 1) return 0;
  return (articleCount - 1) % CATEGORY_GRID_COLS;
}

type BalanceItem = { id: string };

/**
 * Drop 1–3 trailing grid cards when another full row can start on the next page.
 * Keeps a short final page when fewer than four stories remain in the archive.
 */
export async function trimCategoryGridOrphans<T extends BalanceItem>(
  items: T[],
  options: {
    hasNext: boolean;
    boundaryFor: (item: T) => Promise<CategoryCursor["boundary"] | null>;
    countFollowing: (after: CategoryCursor["boundary"]) => Promise<number>;
  },
): Promise<T[]> {
  const orphan = categoryGridOrphanCount(items.length);
  if (orphan === 0 || !options.hasNext) return items;
  const lastShown = items.at(-orphan - 1);
  if (!lastShown) return items;
  const boundary = await options.boundaryFor(lastShown);
  if (!boundary) return items;
  const following = await options.countFollowing(boundary);
  if (following < CATEGORY_GRID_COLS) return items;
  return items.slice(0, items.length - orphan);
}

export function categoryArchiveNextUrl(
  category: { id: string; path: string },
  anchor: string,
  last: CategoryCursor["boundary"],
): string {
  return categoryCursorUrl(category.path, {
    v: 1,
    category: category.id,
    anchor,
    boundary: last,
    direction: "older",
  });
}
