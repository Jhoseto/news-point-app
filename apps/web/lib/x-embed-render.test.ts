import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleEmbedFrame } from "../components/article-embed-frame";

const consent = vi.hoisted(() => ({ external: false }));
vi.mock("../components/cookie-consent-store", () => ({ useCookieConsent: () => ({ record: consent }), openCookieSettings: vi.fn() }));
beforeEach(() => { consent.external = false; });

const post = "https://x.com/TouchlineX/status/218292706224988444";
describe("X post in a public article", () => {
  it("does not request X or render its widget without external content consent", () => {
    const html = renderToStaticMarkup(createElement(ArticleEmbedFrame, { src: post, provider: "x", title: "X post" }));
    expect(html).toContain("Настройки за бисквитки");
    expect(html).not.toContain("platform.x.com");
    expect(html).not.toContain("np-x-post");
  });
  it("renders a source link and widget mount point after consent", () => {
    consent.external = true;
    const html = renderToStaticMarkup(createElement(ArticleEmbedFrame, { src: post, provider: "x", title: "X post" }));
    expect(html).toContain("np-x-post");
    expect(html).toContain("Виж публикацията в X");
    expect(html).toContain(post);
    expect(html).not.toContain("<script");
  });
});
