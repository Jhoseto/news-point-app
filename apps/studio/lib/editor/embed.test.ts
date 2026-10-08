import { describe, expect, it } from "vitest";
import { parseEmbedInput } from "./embed";

describe("parseEmbedInput", () => {
  it("accepts a bare Facebook plugins URL", () => {
    const url =
      "https://www.facebook.com/plugins/video.php?height=476&href=https%3A%2F%2Fwww.facebook.com%2Freel%2F1373144281208938%2F&show_text=false&width=267&t=0";
    expect(parseEmbedInput(url)?.provider).toBe("facebook");
    expect(Object.fromEntries(new URL(parseEmbedInput(url)!.url).searchParams)).toEqual(Object.fromEntries(new URL(url).searchParams));
  });

  it("extracts src from a Facebook iframe paste", () => {
    const html = `<iframe src="https://www.facebook.com/plugins/video.php?height=476&href=https%3A%2F%2Fwww.facebook.com%2Freel%2F1373144281208938%2F&show_text=false&width=267&t=0" width="267" height="476" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowFullScreen="true"></iframe>`;
    const parsed = parseEmbedInput(html);
    expect(parsed?.provider).toBe("facebook");
    expect(parsed?.url).toContain("facebook.com/plugins/video.php");
    expect(parsed?.url).toContain("reel%2F1373144281208938");
  });

  it("decodes &amp; in iframe src", () => {
    const html = `<iframe src="https://www.facebook.com/plugins/video.php?height=476&amp;href=https%3A%2F%2Fwww.facebook.com%2Freel%2F1%2F&amp;show_text=false"></iframe>`;
    const parsed = parseEmbedInput(html);
    expect(new URL(parsed!.url).searchParams.get("href")).toBe("https://www.facebook.com/reel/1/");
    expect(parsed?.url).not.toContain("&amp;");
  });

  it("rejects non-https and empty input", () => {
    expect(parseEmbedInput("")).toBeNull();
    expect(parseEmbedInput("<iframe src='http://example.com'></iframe>")).toBeNull();
    expect(parseEmbedInput("not a url")).toBeNull();
  });
});
