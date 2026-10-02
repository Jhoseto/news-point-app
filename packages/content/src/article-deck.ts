import type { Block } from "./blocks";

function plain(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function comparable(value: string): string {
  return plain(value)
    .replace(/[«»„“”"'`]/g, "")
    .replace(/[…]/g, "")
    .replace(/\.{2,}/g, "")
    .replace(/[\u2010-\u2015-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("bg");
}

function openingOf(blocks: readonly Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "legacy_html" || block.type === "quote") {
      const text = plain(block.html);
      if (text) parts.push(text);
    } else if (block.type === "heading") {
      if (block.text.trim()) parts.push(block.text.trim());
    } else if (block.type === "list") {
      const items = block.items.map((item) => plain(item)).filter(Boolean);
      if (items.length) parts.push(items.join(" "));
    }
    if (parts.join(" ").length >= 800) break;
  }
  return parts.join(" ");
}

/** Text under the title. Empty when the excerpt only repeats the opening of the article. */
export function articleSubtitle(excerpt: string, blocks: readonly Block[]): string {
  const deck = excerpt.trim();
  if (!deck) return "";
  const left = comparable(deck).replace(/[.\s]+$/g, "");
  const right = comparable(openingOf(blocks));
  if (!left || !right) return deck;
  if (right.startsWith(left) || left.startsWith(right)) return "";
  return deck;
}
