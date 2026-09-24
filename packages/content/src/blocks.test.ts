import { describe, expect, it } from "vitest";
import { articleBody } from "./blocks";

const assetId = "3f2b8c1e-6a4d-4e2f-9b1a-7c5d8e9f0a1b";

describe("articleBody", () => {
  it("accepts every supported block type", () => {
    const body = [
      { type: "paragraph", html: "Текст с <strong>удебеляване</strong> и <a href=\"https://newspoint.bg/x/\">връзка</a>." },
      { type: "heading", level: 2, text: "Подзаглавие" },
      { type: "image", mediaAssetId: assetId, caption: "Пловдив" },
      { type: "quote", html: "„Цитат“", cite: "Кмет" },
      { type: "list", ordered: false, items: ["едно", "две"] },
      { type: "embed", provider: "youtube", url: "https://www.youtube.com/watch?v=abc" },
      { type: "legacy_html", html: "<table><tr><td>стара таблица</td></tr></table>" },
    ];
    expect(articleBody.safeParse(body).success).toBe(true);
  });

  it("rejects an image block with a raw URL instead of a media asset", () => {
    expect(articleBody.safeParse([{ type: "image", url: "https://newspoint.bg/wp-content/uploads/a.jpg" }]).success).toBe(false);
    expect(
      articleBody.safeParse([{ type: "image", mediaAssetId: assetId, src: "https://newspoint.bg/a.jpg" }]).success,
    ).toBe(false);
  });

  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<a href=\"javascript:alert(1)\">x</a>",
    "<iframe src=\"https://evil.example\"></iframe>",
    "<style>body{display:none}</style>",
  ])("rejects executable markup: %s", (html) => {
    expect(articleBody.safeParse([{ type: "paragraph", html }]).success).toBe(false);
    expect(articleBody.safeParse([{ type: "legacy_html", html }]).success).toBe(false);
  });

  it("rejects non-https embeds and unknown block types", () => {
    expect(articleBody.safeParse([{ type: "embed", provider: "other", url: "http://example.com" }]).success).toBe(false);
    expect(articleBody.safeParse([{ type: "html", html: "<p>x</p>" }]).success).toBe(false);
  });

  it("keeps headings as plain text", () => {
    expect(articleBody.safeParse([{ type: "heading", level: 2, text: "<b>x</b>" }]).success).toBe(false);
  });
});
