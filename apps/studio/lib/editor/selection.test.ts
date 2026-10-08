import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, NodeSelection } from "@tiptap/pm/state";
import { mediaInsertionPosition } from "./selection";

const schema = new Schema({ nodes: {
  doc: { content: "block+" }, text: { group: "inline" },
  paragraph: { group: "block", content: "inline*" },
  npImage: { group: "block", atom: true },
  npEmbed: { group: "block", atom: true },
  npGallery: { group: "block", content: "npImage+", isolating: true },
} });
const paragraph = () => schema.node("paragraph", null, schema.text("A"));

describe("media insertion beside galleries", () => {
  it.each([4, 5])("inserts after the whole gallery when image at %i is selected", pos => {
    const doc = schema.node("doc", null, [paragraph(), schema.node("npGallery", null, [schema.node("npImage"), schema.node("npImage")]), paragraph()]);
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, pos) });
    const changed = state.tr.insert(mediaInsertionPosition(state.selection), schema.node("npEmbed")).doc;
    expect(changed.childCount).toBe(4);
    expect(changed.child(1).type.name).toBe("npGallery");
    expect(changed.child(1).childCount).toBe(2);
    expect(changed.child(2).type.name).toBe("npEmbed");
  });
  it("keeps a selected image and a selected gallery when inserting another block", () => {
    for (const selected of [schema.node("npImage"), schema.node("npGallery", null, [schema.node("npImage")])]) {
      const doc = schema.node("doc", null, [selected, paragraph()]);
      const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 0) });
      const changed = state.tr.insert(mediaInsertionPosition(state.selection), schema.node("npImage")).doc;
      expect(changed.childCount).toBe(3);
      expect(changed.child(0).eq(selected)).toBe(true);
      expect(changed.child(1).type.name).toBe("npImage");
    }
  });
});
