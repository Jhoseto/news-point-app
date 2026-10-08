import { describe, expect, it } from "vitest";
import { textToBody } from "./body";

const A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const B = "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("textToBody media between paragraphs", () => {
  it("keeps an image between two paragraphs", () => {
    const body = textToBody(`Първи ред\n\n[[image:${A}|size=large|align=center|shape=rectangle|frame=none]]\n\nВтори ред`);
    expect(body.map((block) => block.type)).toEqual(["paragraph", "image", "paragraph"]);
  });

  it("keeps an embed between paragraphs", () => {
    const body = textToBody("Преди\n\n[[embed:youtube|https://www.youtube.com/watch?v=abc]]\n\nСлед");
    expect(body.map((block) => block.type)).toEqual(["paragraph", "embed", "paragraph"]);
  });

  it("keeps a gallery as separate image blocks when joined with blank lines", () => {
    const body = textToBody(`[[image:${A}|size=medium|group=g1]]\n\n[[image:${B}|size=medium|group=g1]]`);
    expect(body).toHaveLength(2);
    expect(body.every((block) => block.type === "image" && block.groupId === "g1")).toBe(true);
  });
});

describe("textToBody line breaks", () => {
  it("keeps a single newline as one paragraph with a soft break", () => {
    const body = textToBody("Първи ред\nВтори ред");
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ type: "paragraph", html: "Първи ред<br>Втори ред" });
  });

  it("splits on a blank line into two paragraphs", () => {
    const body = textToBody("Първи абзац\n\nВтори абзац");
    expect(body.map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
    expect(body[0]).toMatchObject({ html: "Първи абзац" });
    expect(body[1]).toMatchObject({ html: "Втори абзац" });
  });
});
