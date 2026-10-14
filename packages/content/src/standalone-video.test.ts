import { describe, expect, it } from "vitest";
import { articleBody } from "./blocks";
import { standaloneVideoUrl } from "./editorial";

const source = "https://newspoint.bg/wp-content/uploads/2026/10/stoyan-kolev-stoyan818-lenta-v-instagram.mp4";
describe("standalone imported video links", () => {
  it("recognizes the exact archived link from Koce's live article without altering it", () => {
    const html = `<a href="${source}">${source}</a>`;
    expect(standaloneVideoUrl(html)).toBe(source);
    expect(articleBody.parse([{ type: "legacy_html", html }])).toEqual([{ type: "legacy_html", html }]);
  });
  it.each([
    `<p><a target="_blank" href="${source}">Видео</a></p>`,
    `<div>\n<span><a href="${source}">${source}</a></span><br></div>`,
    `<p>&nbsp;<a href="${source}?a=1&amp;b=2">Видео</a>&nbsp;</p>`,
  ])("accepts only a lone video link in simple wrappers: %s", html => {
    expect(standaloneVideoUrl(html)).toMatch(/^https:\/\/newspoint\.bg\/wp-content\/uploads\/2026\/10\/.*\.mp4(?:\?a=1&b=2)?$/);
  });
  it("accepts HTTPS WebM and rejects media paths with credentials or non-video URLs", () => {
    expect(standaloneVideoUrl('<a href="https://cdn.example.org/clip.webm">Видео</a>')).toBe("https://cdn.example.org/clip.webm");
    for (const href of ["http://example.org/clip.mp4", "javascript:alert(1)", "https://user:secret@example.org/clip.mp4", "https://example.org/page?file=clip.mp4"]) {
      expect(standaloneVideoUrl(`<a href="${href}">Видео</a>`)).toBeNull();
    }
  });
  it.each([
    `Преди <a href="${source}">Видео</a>`,
    `<p><a href="${source}">Видео</a> след него</p>`,
    `<a href="${source}">Едно</a><a href="${source}">Две</a>`,
    `<table><tr><td><a href="${source}">В таблица</a></td></tr></table>`,
    `<script>alert(1)</script><a href="${source}">Видео</a>`,
    `<iframe src="${source}"></iframe>`,
  ])("does not replace ordinary prose, mixed archived content or executable markup: %s", html => {
    expect(standaloneVideoUrl(html)).toBeNull();
  });
});
