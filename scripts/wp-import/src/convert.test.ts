import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { articleBody } from "@newspoint/content";
import { convertWordPressHtml, type Conversion } from "./convert";

const BASE = "https://newspoint.bg";

function valid(conversion: Conversion) {
  const resolved = conversion.blocks.map((block) => {
    if (block.type !== "image") return block;
    const { imageIndex: _index, ...rest } = block;
    return { ...rest, mediaAssetId: randomUUID() };
  });
  return articleBody.safeParse(resolved).success;
}

describe("convertWordPressHtml", () => {
  it("keeps paragraphs and headings from a typical article", () => {
    const html = `<p class="isSelectedEnd">Системата BG-ALERT беше <strong>задействана</strong>.</p>
<h2>Какво е известно</h2>
<p><span style="font-weight:400">Огънят се разпространи&nbsp;бързо.</span></p>
<p>&nbsp;</p>`;
    const result = convertWordPressHtml(html, BASE);
    expect(result.blocks).toEqual([
      { type: "paragraph", html: "Системата BG-ALERT беше <strong>задействана</strong>." },
      { type: "heading", level: 2, text: "Какво е известно" },
      { type: "paragraph", html: "Огънят се разпространи бързо." },
    ]);
    expect(result.notes).toEqual([]);
    expect(valid(result)).toBe(true);
  });

  it("turns an image inside a paragraph into an image block with a media reference", () => {
    const html = `<p><img class="alignnone wp-image-168290 size-large" src="https://newspoint.bg/wp-content/uploads/2026/09/a-1024x683.jpg" alt="Пожар" width="1024" height="683"></p>`;
    const result = convertWordPressHtml(html, BASE);
    expect(result.blocks).toEqual([{ type: "image", imageIndex: 0 }]);
    expect(result.images).toEqual([
      { src: "https://newspoint.bg/wp-content/uploads/2026/09/a-1024x683.jpg", width: 1024, height: 683, alt: "Пожар" },
    ]);
    expect(valid(result)).toBe(true);
  });

  it("keeps a figure caption", () => {
    const html = `<figure><img src="/wp-content/uploads/b.jpg"><figcaption>Снимка: <em>МВР</em></figcaption></figure>`;
    const result = convertWordPressHtml(html, BASE);
    expect(result.blocks).toEqual([{ type: "image", imageIndex: 0, caption: "Снимка: МВР" }]);
    expect(result.images[0]?.src).toBe("https://newspoint.bg/wp-content/uploads/b.jpg");
  });

  it("converts Facebook and YouTube iframes to embeds and drops scripts", () => {
    const html = `<p><iframe src="https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2Fx" width="500"></iframe></p>
<iframe src="https://www.youtube.com/embed/abc"></iframe>
<script async src="https://connect.facebook.net/sdk.js"></script>`;
    const result = convertWordPressHtml(html, BASE);
    expect(result.blocks.map((block) => block.type === "embed" && block.provider)).toEqual(["facebook", "youtube"]);
    expect(result.notes).toEqual([{ kind: "dropped_script", detail: "https://connect.facebook.net/sdk.js" }]);
    expect(valid(result)).toBe(true);
  });

  it("recognises a tweet embed", () => {
    const html = `<blockquote class="twitter-tweet"><p>Текст</p><a href="https://twitter.com/user/status/1">date</a></blockquote>`;
    expect(convertWordPressHtml(html, BASE).blocks).toEqual([
      { type: "embed", provider: "x", url: "https://twitter.com/user/status/1" },
    ]);
  });

  it("keeps lists and quotes", () => {
    const html = `<ul><li>първо</li><li><strong>второ</strong></li><li> </li></ul><blockquote><p>„Цитат“</p><p>ред 2</p></blockquote>`;
    expect(convertWordPressHtml(html, BASE).blocks).toEqual([
      { type: "list", ordered: false, items: ["първо", "<strong>второ</strong>"] },
      { type: "quote", html: "„Цитат“<br><br>ред 2" },
    ]);
  });

  it("keeps unknown elements as sanitized legacy HTML and reports them", () => {
    const html = `<table onclick="x()"><tr><td style="color:red">1</td><td><a href="javascript:alert(1)">2</a></td></tr></table>`;
    const result = convertWordPressHtml(html, BASE);
    expect(result.blocks).toHaveLength(1);
    const [block] = result.blocks;
    expect(block?.type).toBe("legacy_html");
    expect(block && "html" in block ? block.html : "").not.toMatch(/onclick|style=|javascript:/);
    expect(result.notes[0]?.kind).toBe("legacy_html");
    expect(valid(result)).toBe(true);
  });

  it("strips event handlers and unsafe links from inline text", () => {
    const html = `<p onmouseover="x()">Текст <a href="javascript:alert(1)">връзка</a> <img src=x onerror=alert(1)></p>`;
    const result = convertWordPressHtml(html, BASE);
    expect(result.blocks[0]).toEqual({ type: "image", imageIndex: 0 });
    expect(result.blocks[1]).toEqual({ type: "paragraph", html: "Текст <a>връзка</a>" });
    expect(valid(result)).toBe(true);
  });
});
