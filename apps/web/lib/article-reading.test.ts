import { describe, expect, it } from "vitest";
import { articleSectionId, articleSections } from "./article-reading";
import type { Block } from "@newspoint/content";

describe("article reading", () => {
  it("derives unique anchors only from real section headings", () => {
    const blocks = [
      { type: "paragraph", html: "<p>Начало</p>" },
      { type: "heading", level: 2, text: "Контекст" },
      { type: "heading", level: 3, text: "Контекст" },
      { type: "heading", level: 4, text: "Бележка" },
    ] as Block[];
    expect(articleSections(blocks)).toEqual([
      { id: "article-section-1", text: "Контекст", level: 2 },
      { id: "article-section-2", text: "Контекст", level: 3 },
    ]);
    expect(articleSectionId(2)).toBe("article-section-2");
  });
});
