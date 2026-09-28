import type { Block } from "@newspoint/content";

export interface ArticleSection {
  id: string;
  text: string;
  level: number;
}

/** IDs depend on block position, so duplicate or edited headings stay unambiguous. */
export function articleSections(blocks: Block[]): ArticleSection[] {
  return blocks.flatMap((block, index) => block.type === "heading" && block.level <= 3
    ? [{ id: `article-section-${index}`, text: block.text, level: block.level }]
    : []);
}

export function articleSectionId(index: number): string {
  return `article-section-${index}`;
}

/** The current article is the fixed centre of the chronological strip. */
export function chronologicalStrip<T extends { id: string }>(older: T[], current: T, newer: T[]): Array<{ article: T; position: "older" | "current" | "newer" }> {
  const seen = new Set([current.id]);
  const unique = (items: T[], position: "older" | "newer") => {
    const result: Array<{ article: T; position: "older" | "newer" }> = [];
    for (const article of items) {
      if (seen.has(article.id)) continue;
      seen.add(article.id);
      result.push({ article, position });
      if (result.length === 2) break;
    }
    return result;
  };
  const before = unique(older, "older").reverse();
  const after = unique(newer, "newer");
  return [...before, { article: current, position: "current" }, ...after];
}
