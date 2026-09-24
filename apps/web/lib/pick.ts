import type { ArticleSummary } from "./queries";

/** Hands out articles so the same story does not repeat on one page. */
export class UniquePicker {
  private readonly seen = new Set<string>();

  take(pool: ArticleSummary[], count: number): ArticleSummary[] {
    const picked: ArticleSummary[] = [];
    for (const article of pool) {
      if (picked.length === count) break;
      if (this.seen.has(article.id)) continue;
      this.seen.add(article.id);
      picked.push(article);
    }
    return picked;
  }
}
