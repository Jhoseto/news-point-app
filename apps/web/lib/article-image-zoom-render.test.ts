import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleImageZoom } from "../components/article-image-zoom";

describe("inline article image zoom trigger", () => {
  it("server renders an accessible dialog button around the unchanged image canvas", () => {
    const html = renderToStaticMarkup(createElement(ArticleImageZoom, {
      images: [{ src: "/test.jpg", alt: "Тестова снимка" }], imageIndex: 0,
      children: createElement("div", { className: "np-media-canvas", style: { aspectRatio: "4/5" } }, createElement("img", { src: "/test.jpg", alt: "Тестова снимка" })),
    }));
    expect(html).toContain('class="np-article-image-zoom"');
    expect(html).toContain('aria-label="Уголеми снимката: Тестова снимка"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('class="np-media-canvas" style="aspect-ratio:4/5"');
    expect(html).not.toContain('role="dialog"');
  });
  it("does not create a broken zoom action when its source index is missing", () => {
    const html = renderToStaticMarkup(createElement(ArticleImageZoom, { images: [], imageIndex: 0, children: createElement("span", null, "Недостъпна снимка") }));
    expect(html).toBe("<span>Недостъпна снимка</span>");
  });
});
