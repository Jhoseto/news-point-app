/** Fixed worker pool for archive import (articles per WP page). */
export async function mapPool<T>(items: readonly T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  const limit = Math.max(1, Math.min(size, items.length || 1));
  let index = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const current = index++;
        if (current >= items.length) break;
        await worker(items[current]!);
      }
    }),
  );
}
