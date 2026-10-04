/**
 * Split an article into `Utterance`s ready to feed the Web Speech API.
 *
 * Each utterance keeps enough metadata so the player can:
 * - scroll & highlight the originating block (`anchorId`),
 * - skip to the previous/next paragraph (`index`),
 * - persist the position across reloads (`id` is stable per article).
 */

import type { ArticleBody, Block } from "@newspoint/content";
import { prepareForSpeech, preprocessBulgarian, stripHtml } from "./text";

export type UtteranceKind =
  | "title"
  | "excerpt"
  | "heading"
  | "paragraph"
  | "quote"
  | "list"
  | "image-caption"
  | "embed-skip";

export interface Utterance {
  id: string;
  kind: UtteranceKind;
  text: string;
  blockIndex: number;
  /** DOM id of the paragraph to highlight while this utterance plays. */
  anchorId?: string;
}

export interface ArticleUtteranceInput {
  id: string;
  title: string;
  excerpt: string;
  body: ArticleBody;
  /** Map from MediaAssetId to alt/caption — only needed for image descriptions. */
  mediaAlt?: Map<string, string>;
}

const SPEECH_CHUNK = 170;

/** Break a paragraph into sentence-sized pieces so the voice does not cut off mid-thought. */
export function splitForSpeech(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  return clean
    .split(/(?<=[.!?])\s+/)
    .flatMap((sentence) => splitLong(sentence.trim(), SPEECH_CHUNK))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function splitLong(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  const pieces = sentence.split(/,\s+/);
  const grouped: string[] = [];
  let buffer = "";
  for (const piece of pieces) {
    const next = buffer ? `${buffer}, ${piece}` : piece;
    if (buffer && next.length > max) {
      grouped.push(buffer);
      buffer = piece;
    } else {
      buffer = next;
    }
  }
  if (buffer) grouped.push(buffer);
  return grouped.flatMap((part) => (part.length <= max ? [part] : hardWrap(part, max)));
}

function hardWrap(part: string, max: number): string[] {
  const out: string[] = [];
  let rest = part.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    const breakAt = window.lastIndexOf(" ");
    const cut = breakAt > 40 ? breakAt : max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function pushText(
  out: Utterance[],
  idBase: string,
  kind: UtteranceKind,
  text: string,
  blockIndex: number,
  anchorId?: string,
): void {
  const parts = splitForSpeech(text);
  parts.forEach((part, partIndex) => {
    out.push({
      id: parts.length === 1 ? idBase : `${idBase}::${partIndex}`,
      kind,
      text: part,
      blockIndex,
      ...(anchorId ? { anchorId } : {}),
    });
  });
}

/** Build the ordered list of utterances for an article. */
export function buildUtterances(article: ArticleUtteranceInput): Utterance[] {
  const out: Utterance[] = [];
  const titleText = prepareForSpeech(article.title);
  if (titleText) {
    pushText(out, `${article.id}::title`, "title", titleText, -1, "article-tts-title");
  }
  const excerptText = prepareForSpeech(article.excerpt);
  if (excerptText) {
    pushText(out, `${article.id}::excerpt`, "excerpt", excerptText, -1, "article-tts-excerpt");
  }
  article.body.forEach((block, blockIndex) => {
    pushBlock(out, article, block, blockIndex);
  });
  return out;
}

/** The full article as one Bulgarian speech script. */
export function articleSpeechText(article: ArticleUtteranceInput): string {
  return buildUtterances(article)
    .map((item) => item.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep one listen request inside a bounded script, ending on a sentence when possible. */
export function capSpeechText(text: string, max = 12_000): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const end = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"));
  return (end > 80 ? slice.slice(0, end + 1) : slice).trim();
}

function plainSpeech(text: string): string {
  return preprocessBulgarian(stripHtml(text));
}

/** Article text for a neural Bulgarian voice. Numbers and words stay as written. */
export function articleReadingText(article: ArticleUtteranceInput): string {
  const parts: string[] = [];
  const title = plainSpeech(article.title);
  const excerpt = plainSpeech(article.excerpt);
  if (title) parts.push(title.endsWith(".") || title.endsWith("!") || title.endsWith("?") ? title : `${title}.`);
  if (excerpt) parts.push(excerpt);
  for (const block of article.body) {
    const piece = plainBlock(block, article);
    if (piece) parts.push(piece);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function plainBlock(block: Block, article: ArticleUtteranceInput): string {
  switch (block.type) {
    case "heading":
      return plainSpeech(block.text);
    case "paragraph":
    case "legacy_html":
      return plainSpeech(block.html);
    case "quote": {
      const inner = plainSpeech(block.html);
      if (!inner) return "";
      const cite = block.cite ? `, ${plainSpeech(block.cite)}` : "";
      return `Цитат: ${inner.replace(/[.,;:!?]+$/g, "")}${cite}.`;
    }
    case "list": {
      const items = block.items.map((item) => plainSpeech(item)).filter((item) => item.length > 0);
      if (!items.length) return "";
      return items.join(block.ordered ? ". " : ", ");
    }
    case "image":
      return plainSpeech(block.caption ?? "") || plainSpeech(article.mediaAlt?.get(block.mediaAssetId) ?? "");
    case "embed":
      return "";
    default:
      return "";
  }
}

function pushBlock(out: Utterance[], article: ArticleUtteranceInput, block: Block, blockIndex: number): void {
  switch (block.type) {
    case "heading": {
      const text = prepareForSpeech(block.text);
      if (!text) return;
      pushText(out, `${article.id}::block-${blockIndex}`, "heading", text, blockIndex, `article-section-${blockIndex}`);
      return;
    }
    case "paragraph": {
      const text = prepareForSpeech(block.html);
      if (!text) return;
      pushText(out, `${article.id}::block-${blockIndex}`, "paragraph", text, blockIndex, `article-section-${blockIndex}`);
      return;
    }
    case "quote": {
      const inner = prepareForSpeech(block.html);
      if (!inner) return;
      const cite = block.cite ? `, ${prepareForSpeech(block.cite)}` : "";
      const spoken = `Цитат: ${inner.replace(/[.,;:!?]+$/g, "")}${cite}.`;
      pushText(out, `${article.id}::block-${blockIndex}`, "quote", spoken, blockIndex, `article-section-${blockIndex}`);
      return;
    }
    case "list": {
      const parts = block.items
        .map((item) => prepareForSpeech(item))
        .filter((item) => item.length > 0);
      if (!parts.length) return;
      const separator = block.ordered ? ". " : ", ";
      pushText(out, `${article.id}::block-${blockIndex}`, "list", parts.join(separator), blockIndex, `article-section-${blockIndex}`);
      return;
    }
    case "image": {
      const caption = block.caption ?? "";
      if (caption) {
        const base = prepareForSpeech(caption);
        const text = base && !/[.!?…]$/.test(base) ? `${base}.` : base;
        if (text) {
          pushText(out, `${article.id}::block-${blockIndex}`, "image-caption", text, blockIndex, `article-section-${blockIndex}`);
        }
        return;
      }
      const alt = article.mediaAlt?.get(block.mediaAssetId) ?? "";
      const base = prepareForSpeech(alt);
      const text = base && !/[.!?…]$/.test(base) ? `${base}.` : base;
      if (!text) return;
      pushText(out, `${article.id}::block-${blockIndex}`, "image-caption", text, blockIndex, `article-section-${blockIndex}`);
      return;
    }
    case "embed": {
      pushText(out, `${article.id}::block-${blockIndex}`, "embed-skip", "Вградено съдържание.", blockIndex, `article-section-${blockIndex}`);
      return;
    }
    case "legacy_html": {
      const text = prepareForSpeech(block.html);
      if (!text) return;
      pushText(out, `${article.id}::block-${blockIndex}`, "paragraph", text, blockIndex, `article-section-${blockIndex}`);
      return;
    }
  }
}

/** Skip an utterance without ending playback. Returns the next index, or null. */
export function nextUtteranceIndex(current: number, total: number): number | null {
  if (current + 1 >= total) return null;
  return current + 1;
}

/** Move to the previous utterance. Returns null when already at the start. */
export function previousUtteranceIndex(current: number): number | null {
  if (current <= 0) return null;
  return current - 1;
}

/** Map the actual block index (in `article.body`) that an utterance belongs to. */
export function blockIndexOf(utterances: readonly Utterance[], utteranceIndex: number): number | null {
  const u = utterances[utteranceIndex];
  return u ? u.blockIndex : null;
}