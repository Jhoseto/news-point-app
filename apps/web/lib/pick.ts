import type { ArticleSummary } from "./queries";

/** Hands out articles so the same story does not repeat on one page. */
export class UniquePicker {
  private readonly seen = new Set<string>();

  take(pool: ArticleSummary[], count: number): ArticleSummary[] {
    const picked: ArticleSummary[] = [];
    for (const article of pool) {
      if (picked.length === count) break;
      const claimed = this.claim(article);
      if (claimed) picked.push(claimed);
    }
    return picked;
  }

  /** Reserves one story. A story already used on the page is skipped. */
  claim(article: ArticleSummary | null | undefined): ArticleSummary | null {
    if (!article || this.seen.has(article.id)) return null;
    this.seen.add(article.id);
    return article;
  }
}
