/** Oldest published first. Missing dates go last. Stable by id. */
export function sortThemeArticlesChronologically<T extends { id: string; publishedAt: Date | string | null }>(
  items: T[],
): T[] {
  return items.slice().sort((left, right) => {
    const a = publishedAtMs(left.publishedAt);
    const b = publishedAtMs(right.publishedAt);
    if (a !== b) return a - b;
    return left.id.localeCompare(right.id);
  });
}

export function isChronologicalThemeOrder<T extends { id: string; publishedAt: Date | string | null }>(
  items: T[],
): boolean {
  const sorted = sortThemeArticlesChronologically(items);
  return items.every((item, index) => item.id === sorted[index]?.id);
}

function publishedAtMs(value: Date | string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
