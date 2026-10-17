import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandLogoImg } from "../components/brand-logo-img";

describe("brand artwork loading", () => {
  it("reserves the header's accessible artwork without two eager img fetches", () => {
    const html = renderToStaticMarkup(createElement(BrandLogoImg, { header: true, className: "np-header-logo np-brand-logo" }));
    expect(html).toContain('role="img"');
    expect(html).toContain("NewsPoint.bg");
    expect(html).toContain("/brand/newspoint-logo-512w.webp");
    expect(html).toContain("/brand/newspoint-logo-dark-512w.webp");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("rel=\"preload\"");
  });
  it("keeps below-fold fixed artwork native lazy with meaningful alt", () => {
    const html = renderToStaticMarkup(createElement(BrandLogoImg, { appearance: "dark", sizes: "280px" }));
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('sizes="280px"');
    expect(html).toContain('alt="NewsPoint.bg');
  });
});
