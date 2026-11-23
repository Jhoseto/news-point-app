import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleEmbedFrame } from "../components/article-embed-frame";
import { createConsent, serializeConsent } from "./cookie-consent";

const consent = vi.hoisted(() => ({ mode: "server" as "server" | "denied" | "allowed" }));
vi.mock("../components/cookie-consent-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/cookie-consent-store")>();
  return {
    ...actual,
    // SSR exercises the real useSyncExternalStore server snapshot. The other
    // modes render the two client consent decisions without a browser fixture.
    useCookieConsent: () => consent.mode === "server"
      ? actual.useCookieConsent()
      : { ready: true, record: { external: consent.mode === "allowed" }, persistent: true },
  };
});

beforeEach(() => { consent.mode = "server"; });
afterEach(() => { vi.unstubAllGlobals(); });

const iframeFixtures = [
  {
    name: "portrait Facebook",
    provider: "facebook",
    src: "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fnewspointbg%2Fvideos%2F123456789%2F&show_text=false&width=267&height=476",
    ratio: "267/476",
  },
  { name: "landscape YouTube", provider: "youtube", src: "https://www.youtube.com/watch?v=abcdefghijk", ratio: "16/9" },
  { name: "portrait Instagram", provider: "instagram", src: "https://www.instagram.com/reel/Abcdef12345/", ratio: "9/16" },
  { name: "portrait TikTok", provider: "tiktok", src: "https://www.tiktok.com/@fixture/video/1234567890123456789", ratio: "9/16" },
  { name: "Reddit", provider: "reddit", src: "https://www.reddit.com/r/news/comments/abcdef/example/", ratio: "4/5" },
];
const layouts = [
  { name: "article body", className: undefined, expectedClass: "np-article-embed-frame" },
  { name: "hero", className: "np-article-hero-embed", expectedClass: "np-article-hero-embed" },
];

function outerCanvas(html: string) {
  const opening = html.match(/^<div\b[^>]*>/)?.[0];
  expect(opening, "embed geometry must belong to the outer canvas").toBeDefined();
  const attribute = (name: string) => opening!.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  const classes = attribute("class")?.split(/\s+/) ?? [];
  expect(classes).toContain("np-embed-canvas");
  return { id: attribute("id"), classes: classes.filter(name => name !== "np-embed-consent"), style: attribute("style") };
}

describe.each(layouts)("$name iframe consent layout", ({ className, expectedClass }) => {
  it.each(iframeFixtures)("keeps the $name canvas through SSR, denial and consent", ({ src, provider, ratio }) => {
    const render = () => renderToStaticMarkup(createElement(ArticleEmbedFrame, {
      src, provider, title: "Video layout fixture", id: "article-section-3", ...(className ? { className } : {}),
    }));

    consent.mode = "allowed";
    const allowed = render();
    const expected = outerCanvas(allowed);
    expect(expected).toEqual({
      id: "article-section-3",
      classes: [expectedClass, "np-embed-canvas"],
      style: `aspect-ratio:${ratio}`,
    });
    expect(allowed.match(/<iframe\b/g)).toHaveLength(1);
    expect(allowed).not.toContain("np-external-consent");
    expect(allowed).not.toMatch(/<script\b/);

    for (const mode of ["server", "denied"] as const) {
      consent.mode = mode;
      const blocked = render();
      expect(outerCanvas(blocked), `${mode} must reserve the player geometry`).toEqual(expected);
      expect(blocked.match(/id="article-section-3"/g)).toHaveLength(1);
      expect(blocked).toContain("np-embed-consent");
      expect(blocked).toContain("np-external-consent");
      expect(blocked).toContain("Настройки за бисквитки");
      expect(blocked).toContain('target="_blank" rel="noopener noreferrer"');
      expect(blocked).not.toMatch(/<(?:iframe|script|video|img|link)\b/);
    }
  });
});

describe("consent boundary and non-iframe layouts", () => {
  it("uses the real null server snapshot even when a returning reader has an allow cookie", () => {
    vi.stubGlobal("document", { cookie: serializeConsent(createConsent({ preferences: true, statistics: true, external: true }, "all"), true) });
    const html = renderToStaticMarkup(createElement(ArticleEmbedFrame, {
      ...iframeFixtures[0]!, title: "Returning reader", id: "returning-reader",
    }));
    expect(outerCanvas(html).style).toBe("aspect-ratio:267/476");
    expect(html).toContain("np-external-consent");
    expect(html).not.toMatch(/<(?:iframe|script|video|img|link)\b/);
  });

  it.each(["server", "denied", "allowed"] as const)("keeps a local native video playable with %s consent", mode => {
    consent.mode = mode;
    const src = "/media/news/2026/11/00000000-0000-0000-0000-000000000001.mp4";
    const html = renderToStaticMarkup(createElement(ArticleEmbedFrame, {
      src, provider: "other", title: "Local video", id: "local-video",
    }));
    expect(html).toContain(`<video id="local-video" src="${src}"`);
    expect(html).toContain("np-native-video");
    expect(html).not.toContain("np-embed-canvas");
    expect(html).not.toContain("np-external-consent");
  });

  it("still blocks remote native video and preserves its non-iframe layout", () => {
    const render = () => renderToStaticMarkup(createElement(ArticleEmbedFrame, {
      src: "https://media.example.org/video.mp4", provider: "other", title: "External video", id: "remote-video",
    }));
    consent.mode = "denied";
    const denied = render();
    expect(denied).toContain("np-external-consent");
    expect(denied).not.toMatch(/<(?:iframe|script|video|img|link)\b/);
    expect(denied).not.toContain("np-embed-canvas");
    consent.mode = "allowed";
    expect(render()).toContain('<video id="remote-video"');
  });

  it("leaves an unsupported provider as a source link", () => {
    const html = renderToStaticMarkup(createElement(ArticleEmbedFrame, {
      src: "https://example.org/post", provider: "other", title: "Source link", id: "source-link",
    }));
    expect(html).toMatch(/^<a id="source-link"/);
    expect(html).toContain('href="https://example.org/post"');
    expect(html).not.toContain("np-embed-canvas");
    expect(html).not.toContain("np-external-consent");
  });
});
