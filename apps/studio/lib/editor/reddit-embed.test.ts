import { describe, expect, it } from "vitest";
import { articleBody, embedFrameUrl, embedProviderFromUrl, parseEmbedInput, publicationProblems } from "@newspoint/content";
import { bodyToText, textToBody } from "./body";
import { bodyToEditorHtml, documentToBody } from "./document";

const source = "https://www.reddit.com/r/interestingasfuck/comments/1x2dlf6/men_saving_liquor_bottles_from_falling_off_the/?utm_source=share&utm_medium=mweb3x&utm_name=post_embed&utm_term=1&utm_content=1";
const frame = "https://embed.reddit.com/r/interestingasfuck/comments/1x2dlf6/men_saving_liquor_bottles_from_falling_off_the/?embed=true&showmedia=true";

describe("Reddit editorial embed", () => {
  it("turns Koce's exact video link into the official media embed without tracking", () => {
    expect(parseEmbedInput(source)).toEqual({ provider: "reddit", url: frame });
    expect(embedFrameUrl(frame)).toBe(frame);
    expect(embedProviderFromUrl(frame)).toBe("reddit");
  });
  it("accepts Reddit's complete blockquote + script embed code from the dialog", () => {
    const snippet = `<blockquote class="reddit-embed-bq" style="height:500px" data-embed-height="500"><a href="${source.replaceAll("&", "&amp;")}">Men saving liquor bottles from falling off the rack</a><br> by<a href="https://www.reddit.com/user/test_fixture/">u/test_fixture</a> in<a href="https://www.reddit.com/r/interestingasfuck/">interestingasfuck</a></blockquote><script async="" src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>`;
    const parsed = parseEmbedInput(snippet);
    expect(parsed).toEqual({ provider: "reddit", url: frame });
    expect(articleBody.parse([{ type: "embed", ...parsed! }])).toEqual([{ type: "embed", provider: "reddit", url: frame }]);
  });
  it("chooses the post link and discards pasted scripts, attributes and unrelated links", () => {
    const snippet = `<BLOCKQUOTE CLASS='other reddit-embed-bq' onclick='alert(1)'><a href='https://evil.test/'>unrelated</a><a href='https://www.reddit.com/r/interestingasfuck/'>community</a><a href='${source}'>post</a></BLOCKQUOTE><script src='https://evil.test/script.js'></script>`;
    expect(parseEmbedInput(snippet)).toEqual({ provider: "reddit", url: frame });
  });
  it.each([
    '<blockquote class="reddit-embed-bq"><a href="https://reddit.com.evil.test/r/aww/comments/crpjwk/title/">post</a></blockquote>',
    '<blockquote class="reddit-embed-bq"><a href="javascript:alert(1)">post</a></blockquote>',
    '<blockquote class="reddit-embed-bq"><a href="https://www.reddit.com/r/aww/">community only</a></blockquote>',
    '<blockquote class="reddit-embed-bq"><a href="https://user:secret@reddit.com/r/aww/comments/crpjwk/title/">post</a></blockquote>',
    '<blockquote><a href="https://reddit.com/r/aww/comments/crpjwk/title/">not a Reddit embed snippet</a></blockquote>',
    '<script>"<blockquote class=\'reddit-embed-bq\'><a href=\'https://reddit.com/r/aww/comments/crpjwk/title/\'>hidden markup</a></blockquote>"</script>',
  ])("rejects snippets without a visible vetted Reddit post: %s", snippet => {
    expect(parseEmbedInput(snippet)).toBeNull();
  });
  it("renders old other-provider blocks without rewriting stored articles", () => {
    const [legacy] = articleBody.parse([{ type: "embed", provider: "other", url: source }]);
    expect(legacy?.type === "embed" && embedFrameUrl(legacy.url)).toBe(frame);
  });
  it("preserves Reddit blocks through both editor transports and server validation", () => {
    const block = { type: "embed" as const, ...parseEmbedInput(source)! };
    const body = articleBody.parse([block]);
    expect(articleBody.parse(textToBody(bodyToText(body)!))).toEqual(body);
    expect(documentToBody({ type: "doc", content: [{ type: "npEmbed", attrs: { block } }] })).toEqual(body);
    expect(bodyToEditorHtml(body)).toContain("data-np-embed");
    expect(publicationProblems({ title: "Тестов материал", slug: "testov-material", bodyBlocks: 1, primaryCategoryId: "test-category", heroMediaId: null, heroEmbedUrl: source, authorKind: "newsroom", authorName: "NewsPoint.bg" })).toEqual([]);
  });
  it("accepts official iframe and old/mobile Reddit post addresses", () => {
    expect(parseEmbedInput(`<iframe src="${frame.replaceAll("&", "&amp;")}"></iframe>`)).toEqual({ provider: "reddit", url: frame });
    for (const host of ["old.reddit.com", "m.reddit.com", "www.redditmedia.com"]) {
      expect(embedFrameUrl(source.replace("www.reddit.com", host))).toBe(frame);
    }
    expect(embedFrameUrl("https://www.reddit.com/r/aww/comments/crpjwk/title/comment123/")).toBe("https://embed.reddit.com/r/aww/comments/crpjwk/title/comment123/?embed=true&showmedia=true");
  });
  it.each([
    "https://reddit.com.evil.test/r/aww/comments/crpjwk/title/",
    "https://evil.reddit.com/r/aww/comments/crpjwk/title/",
    "https://embed.reddit.com.evil.test/r/aww/comments/crpjwk/title/",
    "https://user:password@reddit.com/r/aww/comments/crpjwk/title/",
    "http://reddit.com/r/aww/comments/crpjwk/title/",
    "https://reddit.com/login?dest=https://evil.test",
    "https://reddit.com/r/aww/s/unresolved-share",
    "https://embed.reddit.com/r/aww/comments/crpjwk/title/extra/too-many/",
  ])("keeps unsafe or unresolved Reddit addresses out of iframes: %s", url => {
    expect(embedFrameUrl(url)).toBeNull();
  });
});
