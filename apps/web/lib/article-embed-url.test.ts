import { describe, expect, it } from "vitest";
import { articleEmbedPlayUrl } from "./article-embed-url";

describe("articleEmbedPlayUrl", () => {
  it("normalizes Facebook video.php embeds to the plugins URL", () => {
    const raw =
      "https://www.facebook.com/video.php?height=314&href=https%3A%2F%2Fwww.facebook.com%2Fboyko.borissov.7%2Fvideos%2F1036591812731401%2F&show_text=false&width=560&t=0";
    const out = articleEmbedPlayUrl(raw, "facebook");
    expect(out).toContain("facebook.com/plugins/video.php");
    expect(out).toContain("href=https%3A%2F%2Fwww.facebook.com%2Fboyko.borissov.7%2Fvideos%2F1036591812731401%2F");
    expect(out).toContain("show_text=false");
  });

  it("leaves non-Facebook URLs unchanged", () => {
    const url = "https://www.youtube.com/embed/abc";
    expect(articleEmbedPlayUrl(url, "youtube")).toBe(url);
  });
});
