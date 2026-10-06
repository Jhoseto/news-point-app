import { expect, it } from "vitest";
import { browserMediaSrc } from "./media-src";

it("keeps media on the same host in production and on the local site", () => {
  const path = "/media/news/2026/09/zholej.webp";
  expect(browserMediaSrc(path, "")).toBe(path);
  expect(browserMediaSrc(path, "443")).toBe(path);
  expect(browserMediaSrc(path, "3000")).toBe(path);
});

it("loads media from the site when Studio is opened on its own dev port", () => {
  expect(browserMediaSrc("/media/news/2026/09/zholej.webp", "3001")).toBe("http://localhost:3000/media/news/2026/09/zholej.webp");
  expect(browserMediaSrc("https://newspoint.bg/wp-content/a.jpg", "3001")).toBe("https://newspoint.bg/wp-content/a.jpg");
});

it("rewrites on local Studio SSR the same way as the 3001 browser", () => {
  expect(browserMediaSrc("/media/news/2026/09/zholej.webp")).toBe(
    "http://localhost:3000/media/news/2026/09/zholej.webp",
  );
});
