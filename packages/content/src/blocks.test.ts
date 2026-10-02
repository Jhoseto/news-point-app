import { describe, expect, it } from "vitest";
import { articleBody } from "./blocks";

const assetId = "3f2b8c1e-6a4d-4e2f-9b1a-7c5d8e9f0a1b";

const parseFirst = (input: unknown) => {
  const result = articleBody.safeParse(input);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("expected sanitization to accept input");
  return result.data[0] as { type: string; html?: string };
};

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

  it("strips explicit executable markup from inline and legacy blocks", () => {
    for (const html of [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "<a href=\"javascript:alert(1)\">x</a>",
      "<iframe src=\"https://evil.example\"></iframe>",
      "<style>body{display:none}</style>",
    ]) {
      const paragraph = parseFirst([{ type: "paragraph", html }]);
      const legacy = parseFirst([{ type: "legacy_html", html }]);
      // The sanitizer is allowlist-only: any of the above becomes empty or
      // strips the dangerous element while keeping safe inline content.
      expect(paragraph.html).not.toMatch(/<script|<style|<iframe|onerror\s*=|onload\s*=|javascript:/i);
      expect(legacy.html).not.toMatch(/<script|<style|<iframe|onerror\s*=|onload\s*=|javascript:/i);
    }
  });

  it("blocks denylist bypasses that the old EXECUTABLE_MARKUP regex allowed", () => {
    for (const html of [
      "<img/onerror=alert(1) src=x>",
      "<svg/onload=alert(1)>",
      "<body/onload=alert(1)>",
      "<p onclick=alert(1)>safe</p>",
      "<a href=\"JaVaScRiPt:alert(1)\">x</a>",
    ]) {
      const paragraph = parseFirst([{ type: "paragraph", html }]);
      const legacy = parseFirst([{ type: "legacy_html", html }]);
      expect(paragraph.html).not.toMatch(/on[a-z]+\s*=|javascript:/i);
      expect(legacy.html).not.toMatch(/on[a-z]+\s*=|javascript:/i);
    }
  });

  it("keeps legitimate inline HTML (regression for real imported articles)", () => {
    const paragraph = parseFirst([{ type: "paragraph", html: "<p>обикновен <strong>текст</strong> и <em>акцент</em>.</p>" }]);
    expect(paragraph.html).toContain("<strong>");
    expect(paragraph.html).toContain("<em>");
    const legacy = parseFirst([{ type: "legacy_html", html: "<table><tr><th>h</th></tr><tr><td>c</td></tr></table>" }]);
    expect(legacy.html).toContain("<table>");
    expect(legacy.html).toContain("<th>");
  });

  it("rewrites target=_blank anchors to carry rel=noopener noreferrer", () => {
    const paragraph = parseFirst([
      { type: "paragraph", html: "<a href=\"https://newspoint.bg/x/\" target=\"_blank\">link</a>" },
    ]);
    expect(paragraph.html).toContain('rel="noopener noreferrer"');
  });

  it("rejects non-https embeds and unknown block types", () => {
    expect(articleBody.safeParse([{ type: "embed", provider: "other", url: "http://example.com" }]).success).toBe(false);
    expect(articleBody.safeParse([{ type: "html", html: "<p>x</p>" }]).success).toBe(false);
  });

  it("keeps headings as plain text", () => {
    expect(articleBody.safeParse([{ type: "heading", level: 2, text: "<b>x</b>" }]).success).toBe(false);
  });
});