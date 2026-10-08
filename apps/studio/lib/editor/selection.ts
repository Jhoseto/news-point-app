import type { Selection } from "@tiptap/pm/state";

/** New media beside a gallery must not enter its image-only content. */
export function mediaInsertionPosition(selection: Selection): number {
  for (let depth = selection.$from.depth; depth > 0; depth--) {
    if (selection.$from.node(depth).type.name === "npGallery") return selection.$from.after(depth);
  }
  if (selection.$from.depth > 0 && !selection.$from.node(1).isTextblock) return selection.$from.after(1);
  return selection.to;
}
