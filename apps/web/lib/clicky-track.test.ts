import { expect, it } from "vitest";
import { clickyLinkAction, youtubeTrackingSrc } from "./clicky-track";

it("classifies the same outbound and download links Clicky scans itself", () => {
  expect(clickyLinkAction("https://www.youtube.com/watch?v=abc", "newspoint.bg", "")).toBe("outbound");
  expect(clickyLinkAction("mailto:redakcia@newspoint.bg", "newspoint.bg", "")).toBe("outbound");
  expect(clickyLinkAction("https://newspoint.bg/politika/", "www.newspoint.bg", "")).toBeNull();
  expect(clickyLinkAction("https://newspoint.bg/media/news/2026/10/file.pdf", "newspoint.bg", "")).toBe("download");
  expect(clickyLinkAction("https://cdn.example/clip.mp3?download=1", "newspoint.bg", "")).toBe("download");
  expect(clickyLinkAction("https://example.com/go", "newspoint.bg", "clicky_ignore")).toBeNull();
  expect(clickyLinkAction("/tarsene/", "newspoint.bg", "clicky_log_outbound")).toBe("outbound");
});

it("turns on the YouTube player API without changing other embeds", () => {
  expect(youtubeTrackingSrc("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1");
  expect(youtubeTrackingSrc("https://www.youtube.com/embed/dQw4w9WgXcQ?start=10")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?start=10&enablejsapi=1");
  expect(youtubeTrackingSrc("https://player.vimeo.com/video/76979871")).toBe("https://player.vimeo.com/video/76979871");
});
