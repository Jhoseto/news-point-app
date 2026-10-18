import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEmbedInput } from "@newspoint/content";
import { ArticleEmbedFrame } from "../components/article-embed-frame";
const consent = vi.hoisted(() => ({ external: true }));
vi.mock("../components/cookie-consent-store", () => ({ useCookieConsent: () => ({ record: consent }), openCookieSettings: vi.fn() }));
beforeEach(() => { consent.external = true; });

describe("published Reddit embed rendering", () => {
  it("shows an inert source link and settings instead of loading Reddit without external consent", () => {
    consent.external = false;
    const html = renderToStaticMarkup(createElement(ArticleEmbedFrame, { src: "https://www.reddit.com/r/news/comments/abcdef/example/", provider: "reddit", title: "Reddit consent fixture" }));
    expect(html).not.toMatch(/<iframe|<script/);
    expect(html).toContain("Настройки за бисквитки");
    expect(html).toContain('target="_blank"');
  });
  it("renders the official pasted snippet as a player without including its script", () => {
    const parsed = parseEmbedInput('<blockquote class="reddit-embed-bq"><a href="https://www.reddit.com/r/interestingasfuck/comments/1x2dlf6/men_saving_liquor_bottles_from_falling_off_the/">Post</a></blockquote><script async="" src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>');
    expect(parsed).not.toBeNull();
    const html = renderToStaticMarkup(createElement(ArticleEmbedFrame, { src: parsed!.url, provider: parsed!.provider, title: "Reddit snippet test fixture" }));
    expect(html).toContain('<iframe src="https://embed.reddit.com/');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("widgets.js");
    expect(html).not.toContain("Виж публикацията");
  });
  it.each(["reddit", "other"])("renders a player for new and existing %s blocks", provider => {
    const html = renderToStaticMarkup(createElement(ArticleEmbedFrame, {
      src: "https://www.reddit.com/r/interestingasfuck/comments/1x2dlf6/men_saving_liquor_bottles_from_falling_off_the/?utm_source=share",
      title: "Reddit video test fixture",
      provider,
    }));
    expect(html).toContain('<iframe src="https://embed.reddit.com/');
    expect(html).toContain("showmedia=true");
    expect(html).not.toContain("Виж публикацията");
    expect(html).not.toContain("utm_source");
  });
});
