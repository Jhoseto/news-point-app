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
