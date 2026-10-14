import { describe, expect, it } from "vitest";
import type { Block } from "@newspoint/content";
import type { Media } from "./queries";
import { articleImageGallery } from "./article-image-gallery";

const asset = (url: string): Media => ({ url, alt: "Alt на актива", caption: "Надпис на актива", credit: "Автор", width: 800, height: 600 });
const image = (id: string, extra: Partial<Extract<Block, { type: "image" }>> = {}): Block => ({ type: "image", mediaAssetId: id, ...extra });

describe("article lightbox image order", () => {
  it("puts the visible hero first and body images in document order, excluding unused assets", () => {
    const blocks: Block[] = [{ type: "paragraph", html: "Тест" }, image("b"), image("a")];
    const media = new Map([["a", asset("/a.jpg")], ["unused", asset("/unused.jpg")], ["b", asset("/b.jpg")]]);
    const gallery = articleImageGallery(blocks, media, asset("/hero.jpg"));
    expect(gallery.images.map(item => item.src)).toEqual(["/hero.jpg", "/b.jpg", "/a.jpg"]);
    expect([...gallery.bodyIndices]).toEqual([[1, 1], [2, 2]]);
  });
  it("works with a video/no hero and skips missing or unusable image assets", () => {
    const blocks = [image("missing"), image("empty"), image("a")];
    const gallery = articleImageGallery(blocks, new Map([["empty", asset("")], ["a", asset("/a.jpg")]]));
    expect(gallery.images.map(item => item.src)).toEqual(["/a.jpg"]);
    expect([...gallery.bodyIndices]).toEqual([[2, 0]]);
  });
  it("keeps gallery and repeated image occurrences with their own alt/caption overrides", () => {
    const blocks = [image("a", { groupId: "test", alt: "Първа", caption: "Първи надпис" }), image("a", { groupId: "test", alt: "Втора", caption: "" })];
    const gallery = articleImageGallery(blocks, new Map([["a", asset("/a.jpg")]]));
    expect(gallery.images).toEqual([
      { src: "/a.jpg", alt: "Първа", caption: "Първи надпис", credit: "Автор" },
      { src: "/a.jpg", alt: "Втора", caption: "", credit: "Автор" },
    ]);
    expect([...gallery.bodyIndices]).toEqual([[0, 0], [1, 1]]);
  });
});
