import type { Node } from "@tiptap/pm/model";
import { mediaWidth } from "@newspoint/content";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

export function isWrappedMedia(node: Node): boolean {
  const block = node.attrs.block;
  return ["npImage", "npEmbed"].includes(node.type.name) &&
    !!block && ["left", "right"].includes(block.wrap) && mediaWidth(block) <= 50;
}

function isWrapBoundary(node: Node): boolean {
  return ["npImage", "npEmbed", "npGallery", "horizontalRule", "npLegacy"].includes(node.type.name) || node.attrs.clearMedia === true;
}

function wrappedMediaBefore(doc: Node, position: number): boolean {
  let wrapped = false;
  doc.forEach((node, offset) => {
    if (offset >= position) return;
    if (isWrapBoundary(node)) wrapped = isWrappedMedia(node);
  });
  return wrapped;
}

/** Enter on the empty paragraph beside a float ends wrapping without deleting text. */
export function clearEmptyWrappedParagraph(state: EditorState): Transaction | null {
  const { selection } = state;
  const { $from } = selection;
  if (!(selection instanceof TextSelection) || !selection.empty || $from.depth !== 1 ||
    $from.parent.type.name !== "paragraph" || $from.parent.content.size !== 0 ||
    $from.parent.attrs.clearMedia || !wrappedMediaBefore(state.doc, $from.before(1))) return null;
  return closeHistory(state.tr.setNodeMarkup($from.before(1), undefined, { ...$from.parent.attrs, clearMedia: true }).setStoredMarks(null).scrollIntoView());
}

/** Continue after the selected media's side text, or at the bottom of the document. */
export function paragraphBelowMedia(state: EditorState, mediaPosition?: number): Transaction | null {
  let position = state.doc.content.size;
  if (mediaPosition !== undefined) {
    const media = state.doc.nodeAt(mediaPosition);
    if (!media || !isWrappedMedia(media) || state.doc.resolve(mediaPosition).depth !== 0) return null;
    position = mediaPosition + media.nodeSize;
    while (position < state.doc.content.size) {
      const next = state.doc.nodeAt(position);
      if (!next || isWrapBoundary(next)) break;
      position += next.nodeSize;
    }
  }
  const tr = closeHistory(state.tr);
  const next = tr.doc.nodeAt(position);
  let paragraphPosition = position;
  if (next?.type.name === "paragraph" && next.attrs.clearMedia) {
    // Reuse an existing continuation rather than creating blank paragraphs.
  } else {
    const $position = tr.doc.resolve(position);
    const previous = $position.nodeBefore;
    if (previous?.type.name === "paragraph" && previous.content.size === 0) {
      paragraphPosition -= previous.nodeSize;
      tr.setNodeMarkup(paragraphPosition, undefined, { ...previous.attrs, clearMedia: true });
    } else {
      const paragraph = state.schema.nodes.paragraph;
      if (!paragraph || !$position.parent.canReplaceWith($position.index(), $position.index(), paragraph)) return null;
      tr.insert(position, paragraph.create({ clearMedia: true }));
    }
  }
  return tr.setSelection(TextSelection.create(tr.doc, paragraphPosition + 1)).setStoredMarks(null).scrollIntoView();
}
