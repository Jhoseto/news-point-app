import { describe, expect, it } from "vitest";
import type { ArticleBody } from "@newspoint/content";
import {
  blockIndexOf,
  buildUtterances,
  articleSpeechText,
  articleReadingText,
  capSpeechText,
  nextUtteranceIndex,
  previousUtteranceIndex,
} from "./utterances";

const bodyOf = (...blocks: ArticleBody): ArticleBody => blocks;

const sample = {
  id: "article-1",
  title: "Заглавие на статията",
  excerpt: "Кратко описание на статията.",
  body: bodyOf(
    { type: "paragraph", html: "Първи параграф от тялото." },
    { type: "heading", level: 2, text: "Подзаглавие" },
    { type: "paragraph", html: "Втори параграф." },
  ),
  mediaAlt: new Map<string, string>([["asset-1", "Алтернативен текст"]]),
};

describe("buildUtterances", () => {
  it("emits title and excerpt before the body", () => {
    const list = buildUtterances(sample);
    expect(list[0]?.kind).toBe("title");
    expect(list[1]?.kind).toBe("excerpt");
    expect(list[0]?.text).toBe("Заглавие на статията");
    expect(list[1]?.text).toBe("Кратко описание на статията.");
  });

  it("numbers the block utterances from 0", () => {
    const list = buildUtterances(sample);
    expect(list.map((u) => u.kind)).toEqual([
      "title",
      "excerpt",
      "paragraph",
      "heading",
      "paragraph",
    ]);
    expect(list[2]?.blockIndex).toBe(0);
    expect(list[3]?.blockIndex).toBe(1);
    expect(list[4]?.blockIndex).toBe(2);
  });

  it("gives the first body block an anchorId matching the section", () => {
    const list = buildUtterances(sample);
    expect(list[2]?.anchorId).toBe("article-section-0");
  });

  it("skips an image block when no caption and no alt text exist", () => {
    const list = buildUtterances({
      ...sample,
      body: bodyOf({ type: "image", mediaAssetId: "asset-9", caption: "" }),
    });
    expect(list.map((u) => u.kind)).toEqual(["title", "excerpt"]);
  });

  it("emits an image utterance when caption or alt is present", () => {
    const list = buildUtterances({
      ...sample,
      body: bodyOf(
        { type: "image", mediaAssetId: "asset-1", caption: "" },
      ),
    });
    expect(list[2]?.kind).toBe("image-caption");
    expect(list[2]?.text).toContain("Алтернативен текст");
  });

  it("prefers the caption over the alt text when both exist", () => {
    const list = buildUtterances({
      ...sample,
      body: bodyOf(
        { type: "image", mediaAssetId: "asset-1", caption: "Описание на снимката" },
      ),
    });
    expect(list[2]?.text).toBe("Описание на снимката.");
  });

  it("announces an embed without speaking its source", () => {
    const list = buildUtterances({
      ...sample,
      body: bodyOf({ type: "embed", provider: "youtube", url: "https://www.youtube.com/watch?v=abc" }),
    });
    expect(list[2]?.kind).toBe("embed-skip");
    expect(list[2]?.text).toBe("Вградено съдържание.");
  });

  it("prepends 'Цитат:' to a quote", () => {
    const list = buildUtterances({
      ...sample,
      body: bodyOf({ type: "quote", html: "Думата е важна.", cite: "Петър" }),
    });
    expect(list[2]?.kind).toBe("quote");
    expect(list[2]?.text).toContain("Цитат:");
    expect(list[2]?.text).toContain("Думата е важна");
    expect(list[2]?.text).toContain("Петър");
  });

  it("joins list items with '. ' for ordered, ', ' for unordered", () => {
    const ordered = buildUtterances({
      ...sample,
      body: bodyOf({ type: "list", ordered: true, items: ["едно", "две", "три"] }),
    });
    expect(ordered.slice(2).map((item) => item.text)).toEqual(["едно.", "две.", "три"]);
    const unordered = buildUtterances({
      ...sample,
      body: bodyOf({ type: "list", ordered: false, items: ["едно", "две"] }),
    });
    expect(unordered[2]?.text).toBe("едно, две");
  });

  it("strips legacy_html blocks", () => {
    const list = buildUtterances({
      ...sample,
      body: bodyOf({ type: "legacy_html", html: "<p>Стар <em>формат</em>.</p>" }),
    });
    expect(list[2]?.kind).toBe("paragraph");
    expect(list[2]?.text).toBe("Стар формат.");
  });

  it("returns only title and excerpt when the body is empty", () => {
    const list = buildUtterances({ ...sample, body: [] });
    expect(list.map((u) => u.kind)).toEqual(["title", "excerpt"]);
  });

  it("omits title or excerpt when they are blank", () => {
    const list = buildUtterances({ ...sample, title: "", excerpt: "" });
    expect(list.map((u) => u.kind)).toEqual(["paragraph", "heading", "paragraph"]);
  });

  it("joins the article into one speech script", () => {
    const text = articleSpeechText(sample);
    expect(text.startsWith("Заглавие на статията")).toBe(true);
    expect(text).toContain("Първи параграф от тялото.");
  });

  it("keeps written Bulgarian for the neural voice", () => {
    const text = articleReadingText({
      ...sample,
      title: "Новина от 2024 година",
      excerpt: "",
      body: [],
    });
    expect(text).toContain("2024");
    expect(text).not.toContain("две хиляди");
  });
  it("caps a long script on a sentence", () => {
    const capped = capSpeechText(`${"Изречение. ".repeat(2000)}`, 500);
    expect(capped.length).toBeLessThanOrEqual(500);
    expect(capped.endsWith(".")).toBe(true);
  });
});

describe("nextUtteranceIndex / previousUtteranceIndex", () => {
  const list = buildUtterances(sample);

  it("returns the next index while there is one", () => {
    expect(nextUtteranceIndex(0, list.length)).toBe(1);
    expect(nextUtteranceIndex(2, list.length)).toBe(3);
  });

  it("returns null at the end", () => {
    expect(nextUtteranceIndex(list.length - 1, list.length)).toBeNull();
  });

  it("returns null when already at 0", () => {
    expect(previousUtteranceIndex(0)).toBeNull();
  });

  it("returns the previous index while there is one", () => {
    expect(previousUtteranceIndex(2)).toBe(1);
  });
});

describe("blockIndexOf", () => {
  it("returns the block index of the utterance", () => {
    const list = buildUtterances(sample);
    expect(blockIndexOf(list, 0)).toBe(-1);
    expect(blockIndexOf(list, 2)).toBe(0);
    expect(blockIndexOf(list, 3)).toBe(1);
  });

  it("returns null when the index is out of range", () => {
    expect(blockIndexOf(buildUtterances(sample), 99)).toBeNull();
  });
});