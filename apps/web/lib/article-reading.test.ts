import { describe, expect, it } from "vitest";
import { articleSectionId, articleSections, chronologicalStrip } from "./article-reading";
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

  it("orders older-to-newer, keeps current in the middle and drops duplicates", () => {
    const current = { id: "c" };
    const strip = chronologicalStrip([{ id: "b" }, { id: "a" }, { id: "c" }], current, [{ id: "d" }, { id: "b" }, { id: "e" }]);
    expect(strip.map(({ article, position }) => [article.id, position])).toEqual([
      ["a", "older"], ["b", "older"], ["c", "current"], ["d", "newer"], ["e", "newer"],
    ]);
    expect(chronologicalStrip([], current, [])).toEqual([{ article: current, position: "current" }]);
  });
});
