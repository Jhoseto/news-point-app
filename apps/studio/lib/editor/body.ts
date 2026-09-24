import type { ArticleBody } from "@newspoint/content";

// The T8 editor is a plain text area (the rich text editor comes in P4,
// DEC-106). Blank lines separate blocks; "## " and "### " start headings,
// "> " starts a quote. Text is escaped, so no markup reaches the body.

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const inline = (lines: string[]) => lines.map((line) => escapeHtml(line.trim())).join("<br>");

export function textToBody(text: string): ArticleBody {
  const chunks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.split("\n").filter((line) => line.trim()))
    .filter((lines) => lines.length);

  return chunks.map((lines) => {
    const first = lines[0]!.trim();
    if (lines.length === 1 && /^###\s+/.test(first)) {
      return { type: "heading", level: 3, text: first.replace(/^###\s+/, "").replace(/[<>]/g, "") };
    }
    if (lines.length === 1 && /^##\s+/.test(first)) {
      return { type: "heading", level: 2, text: first.replace(/^##\s+/, "").replace(/[<>]/g, "") };
    }
    if (lines.every((line) => /^\s*>/.test(line))) {
      return { type: "quote", html: inline(lines.map((line) => line.replace(/^\s*>\s?/, ""))) };
    }
    return { type: "paragraph", html: inline(lines) };
  });
}

/** Back to editor text. Null when the body has blocks the text editor cannot represent. */
export function bodyToText(body: ArticleBody): string | null {
  const parts: string[] = [];
  for (const block of body) {
    if (block.type === "paragraph") parts.push(unescapeHtml(block.html));
    else if (block.type === "heading" && block.level !== 4) parts.push(`${"#".repeat(block.level)} ${block.text}`);
    else if (block.type === "quote" && !block.cite)
      parts.push(
        unescapeHtml(block.html)
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n"),
      );
    else return null;
  }
  return parts.join("\n\n");
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}
