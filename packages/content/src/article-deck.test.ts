import { describe, expect, it } from "vitest";
import { articleSubtitle } from "./article-deck";
import type { Block } from "./blocks";

const lead = "Славчо Мегеров – Мегера вече официално е привлечен като обвиняем за предумишленото убийство.";

describe("articleSubtitle", () => {
  it("keeps a subtitle that is not the opening of the article", () => {
    const blocks: Block[] = [{ type: "paragraph", html: `<p>${lead}</p>` }];
    expect(articleSubtitle("Прокуратурата поиска постоянен арест.", blocks)).toBe("Прокуратурата поиска постоянен арест.");
  });

  it("hides an excerpt that repeats the lead, including a trailing ellipsis", () => {
    const blocks: Block[] = [{ type: "paragraph", html: `<p>${lead} Разглеждането е на 4 октомври.</p>` }];
    expect(articleSubtitle(`${lead}…`, blocks)).toBe("");
    expect(articleSubtitle(lead, blocks)).toBe("");
  });

  it("hides nothing when the excerpt is empty", () => {
    expect(articleSubtitle("  ", [{ type: "paragraph", html: "<p>Текст.</p>" }])).toBe("");
  });

  it("skips a leading image and still detects a repeated paragraph", () => {
    const blocks: Block[] = [
      { type: "image", mediaAssetId: "00000000-0000-4000-8000-000000000001" },
      { type: "paragraph", html: `<p>${lead}</p>` },
    ];
    expect(articleSubtitle(lead, blocks)).toBe("");
  });
});
