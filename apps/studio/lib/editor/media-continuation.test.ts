import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { history, undo } from "@tiptap/pm/history";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { articleBody, composition } from "@newspoint/content";
import { bodyToEditorHtml, documentToBody } from "./document";
import { bodyToText } from "./body";
import { clearEmptyWrappedParagraph, isWrappedMedia, paragraphBelowMedia } from "./media-continuation";

// Explicit in-memory editor fixtures; no live articles or database access.
const schema = new Schema({ nodes: {
  doc: { content: "(block | articleMedia)+" }, text: { group: "inline" },
  paragraph: { group: "block", content: "inline*", attrs: { clearMedia: { default: false }, textAlign: { default: null } } },
  blockquote: { group: "block", content: "block+" },
  horizontalRule: { group: "block" },
  npImage: { group: "articleMedia", atom: true, attrs: { block: { default: null } } },
  npEmbed: { group: "articleMedia", atom: true, attrs: { block: { default: null } } },
  npGallery: { group: "articleMedia", content: "npImage+", isolating: true },
} });
const paragraph = (text = "", clearMedia = false) => schema.node("paragraph", { clearMedia }, text ? schema.text(text) : undefined);
const media = (wrap = "left", name = "npImage") => schema.node(name, { block: { type: name === "npImage" ? "image" : "embed", wrap, widthPercent: 40, ...(name === "npImage" ? { mediaAssetId: "00000000-0000-4000-8000-000000000001" } : { provider: "other", url: "https://example.org/clip.mp4" }) } });

describe("continue below wrapped media", () => {
  it("uses the same effective media width as editor and public composition", () => {
    const block = { type: "image", mediaAssetId: "00000000-0000-4000-8000-000000000001", wrap: "left" };
    expect(isWrappedMedia(schema.node("npImage", { block }))).toBe(false);
    expect(isWrappedMedia(schema.node("npImage", { block: { ...block, size: "small" } }))).toBe(true);
  });
  it.each(["left", "right"])("keeps %s media and side text while moving the cursor below them", wrap => {
    const image = media(wrap);
    const side = paragraph("Текст до медията");
    const doc = schema.node("doc", null, [image, side, paragraph()]);
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 0) });
    const changed = state.apply(paragraphBelowMedia(state, 0)!);
    expect(changed.doc.childCount).toBe(3);
    expect(changed.doc.child(0).eq(image)).toBe(true);
    expect(changed.doc.child(1).eq(side)).toBe(true);
    expect(changed.doc.child(2).attrs.clearMedia).toBe(true);
    expect(changed.selection instanceof TextSelection).toBe(true);
    const typed = changed.apply(changed.tr.insertText("Текст под медията"));
    const body = documentToBody(typed.doc.toJSON());
    expect(body.at(-1)).toEqual({ type: "paragraph", html: "Текст под медията", clearMedia: true });
    expect(composition(body.at(-1)!).style.clear).toBe("both");
  });
  it("inserts after side paragraphs and before the next media without changing them", () => {
    const doc = schema.node("doc", null, [media("right", "npEmbed"), paragraph("Първи"), paragraph("Втори"), media("none")]);
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 0) });
    const changed = state.apply(paragraphBelowMedia(state, 0)!);
    expect(changed.doc.childCount).toBe(5);
    expect(changed.doc.child(1).textContent).toBe("Първи");
    expect(changed.doc.child(2).textContent).toBe("Втори");
    expect(changed.doc.child(3).attrs.clearMedia).toBe(true);
    expect(changed.doc.child(4).eq(doc.child(3))).toBe(true);
  });
  it("reuses an existing continuation and keeps repeated clicks from adding blanks", () => {
    const doc = schema.node("doc", null, [media(), paragraph("Встрани"), paragraph("Отдолу", true)]);
    const state = EditorState.create({ doc });
    const changed = state.apply(paragraphBelowMedia(state, 0)!);
    expect(changed.doc.eq(doc)).toBe(true);
    expect(changed.selection.$from.parent.textContent).toBe("Отдолу");
    const bottom = schema.node("doc", null, [media(), paragraph()]);
    const bottomState = EditorState.create({ doc: bottom });
    const first = bottomState.apply(paragraphBelowMedia(bottomState)!);
    const second = first.apply(paragraphBelowMedia(first)!);
    expect(second.doc.eq(first.doc)).toBe(true);
  });
  it("Enter on an empty side paragraph clears it without creating an extra paragraph", () => {
    const doc = schema.node("doc", null, [media(), paragraph("Встрани"), paragraph()]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, doc.content.size - 1) });
    const changed = state.apply(clearEmptyWrappedParagraph(state)!);
    expect(changed.doc.childCount).toBe(doc.childCount);
    expect(changed.doc.lastChild?.attrs.clearMedia).toBe(true);
    expect(changed.selection.from).toBe(state.selection.from);
    expect(clearEmptyWrappedParagraph(changed)).toBeNull();
  });
  it("leaves ordinary Enter, list/quote content, nonempty text and separate media alone", () => {
    for (const doc of [
      schema.node("doc", null, [paragraph()]),
      schema.node("doc", null, [media("none"), paragraph()]),
      schema.node("doc", null, [media(), paragraph("Текст")]),
      schema.node("doc", null, [media(), schema.node("blockquote", null, paragraph())]),
      schema.node("doc", null, [media(), schema.node("horizontalRule"), paragraph()]),
      schema.node("doc", null, [media(), paragraph("Под медията", true), paragraph()]),
    ]) {
      const state = EditorState.create({ doc, selection: TextSelection.atEnd(doc) });
      expect(clearEmptyWrappedParagraph(state)).toBeNull();
    }
  });
  it("does not put paragraph nodes inside image-only galleries", () => {
    const doc = schema.node("doc", null, [schema.node("npGallery", null, [media()]), paragraph()]);
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 1) });
    expect(paragraphBelowMedia(state, 1)).toBeNull();
    const changed = state.apply(paragraphBelowMedia(state)!);
    expect(changed.doc.child(0).eq(doc.child(0))).toBe(true);
    expect(changed.selection.$from.depth).toBe(1);
  });
  it("preserves a blank wrap boundary through save/reload and refuses lossy text transport", () => {
    const body = articleBody.parse([{ type: "paragraph", html: "", clearMedia: true }]);
    expect(documentToBody({ type: "doc", content: [paragraph("", true).toJSON()] })).toEqual(body);
    expect(bodyToEditorHtml(body)).toContain('data-clear-media="true"');
    expect(bodyToEditorHtml(body)).toContain('style="clear:both"');
    expect(bodyToText(body)).toBeNull();
  });
  it("can undo the continuation without deleting or moving the original side text", () => {
    const doc = schema.node("doc", null, [media(), paragraph("Встрани")]);
    const state = EditorState.create({ doc, plugins: [history()] });
    let changed = state.apply(paragraphBelowMedia(state, 0)!);
    expect(undo(changed, tr => { changed = changed.apply(tr); })).toBe(true);
    expect(changed.doc.eq(doc)).toBe(true);
  });
});
