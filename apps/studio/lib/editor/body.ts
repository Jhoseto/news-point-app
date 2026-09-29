import type { ArticleBody } from "@newspoint/content";

// The editor keeps a safe plain-text source while offering block controls.
// Blank lines separate blocks; headings, quotes and lists use familiar Markdown
// markers underneath so existing drafts remain backwards compatible.

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
    .replace(/<em>(.*?)<\/em>/g, "*$1*")
    .replace(/<a href="(https:\/\/[^\"]+)">(.*?)<\/a>/g, "[$2]($1)")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function inlineMarkup(line: string): string {
  return escapeHtml(line.trim())
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

const inline = (lines: string[]) => lines.map(inlineMarkup).join("<br>");

export function textToBody(text: string): ArticleBody {
  const chunks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.split("\n").filter((line) => line.trim()))
    .filter((lines) => lines.length);

  return chunks.map((lines) => {
    const first = lines[0]!.trim();
    const imageMatch = first.match(/^\[\[image:([0-9a-f-]{36})(?:\|([^\]]+))?\]\]$/i);
    if (lines.length === 1 && imageMatch) {
      const options = Object.fromEntries((imageMatch[2] ?? "").split("|").filter(Boolean).map((item) => item.split("=") as [string, string]));
      return { type: "image", mediaAssetId: imageMatch[1]!, size: options.size as "small" | "medium" | "large" | "full" | undefined, align: options.align as "left" | "center" | "right" | undefined, shape: options.shape as "rectangle" | "rounded" | "circle" | undefined, frame: options.frame as "none" | "soft" | "line" | undefined, groupId: options.group, focalX: options.fx ? Number(options.fx) : undefined, focalY: options.fy ? Number(options.fy) : undefined, crop: options.crop as "original" | "square" | "portrait" | "landscape" | undefined };
    }
    if (lines.length === 1 && /^###\s+/.test(first)) {
      return { type: "heading", level: 3, text: first.replace(/^###\s+/, "").replace(/[<>]/g, "") };
    }
    if (lines.length === 1 && /^##\s+/.test(first)) {
      return { type: "heading", level: 2, text: first.replace(/^##\s+/, "").replace(/[<>]/g, "") };
    }
    if (lines.every((line) => /^\s*>/.test(line))) {
      return { type: "quote", html: inline(lines.map((line) => line.replace(/^\s*>\s?/, ""))) };
    }
    const unordered = lines.every((line) => /^\s*[-*]\s+/.test(line));
    const ordered = lines.every((line) => /^\s*\d+[.)]\s+/.test(line));
    if (unordered || ordered) {
      return {
        type: "list",
        ordered,
        items: lines.map((line) => escapeHtml(line.replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, "").trim())),
      };
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
    else if (block.type === "list") parts.push(block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${unescapeHtml(item)}`).join("\n"));
    else if (block.type === "image") parts.push(`[[image:${block.mediaAssetId}${block.size || block.align || block.shape || block.frame || block.groupId || block.focalX !== undefined || block.focalY !== undefined || block.crop ? `|${Object.entries({ size: block.size, align: block.align, shape: block.shape, frame: block.frame, group: block.groupId, fx: block.focalX, fy: block.focalY, crop: block.crop }).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}=${value}`).join("|")}` : ""}]]`);
    else return null;
  }
  return parts.join("\n\n");
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function bodyTextToHtml(text: string): string {
  return textToBody(text).map((block) => {
    if (block.type === "heading") return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
    if (block.type === "image") return `<p><img data-media-id="${block.mediaAssetId}" data-group-id="${block.groupId ?? ""}" data-size="${block.size ?? "large"}" data-align="${block.align ?? "center"}" data-shape="${block.shape ?? "rectangle"}" data-frame="${block.frame ?? "none"}" data-focal-x="${block.focalX ?? 50}" data-focal-y="${block.focalY ?? 50}" data-crop="${block.crop ?? "original"}" /></p>`;
    if (block.type === "quote") return `<blockquote>${block.html}</blockquote>`;
    if (block.type === "list") return `<${block.ordered ? "ol" : "ul"}>${block.items.map((item) => `<li>${item}</li>`).join("")}</${block.ordered ? "ol" : "ul"}>`;
    return block.type === "paragraph" ? `<p>${block.html}</p>` : "";
  }).join("");
}

function inlineFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return Array.from(node.childNodes).map(inlineFromNode).join("");
  const value = Array.from(node.childNodes).map(inlineFromNode).join("");
  if (node.tagName === "STRONG" || node.tagName === "B") return `**${value}**`;
  if (node.tagName === "EM" || node.tagName === "I") return `*${value}*`;
  if (node.tagName === "A" && node.getAttribute("href")?.startsWith("https://")) return `[${value}](${node.getAttribute("href")})`;
  return value;
}

export function htmlToBodyText(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const root = new DOMParser().parseFromString(html, "text/html").body;
  return Array.from(root.children).map((element) => {
    const images = Array.from(element.querySelectorAll("img[data-media-id]"));
    const image = images[0];
    if (image) {
      return images.map((item) => {
        const options = ["size", "align", "shape", "frame"].flatMap((key) => item.getAttribute(`data-${key}`) ? [`${key}=${item.getAttribute(`data-${key}`)}`] : []);
        if (item.getAttribute("data-focal-x")) options.push(`fx=${item.getAttribute("data-focal-x")}`);
        if (item.getAttribute("data-focal-y")) options.push(`fy=${item.getAttribute("data-focal-y")}`);
        if (item.getAttribute("data-crop")) options.push(`crop=${item.getAttribute("data-crop")}`);
        const group = item.getAttribute("data-group-id");
        if (group) options.push(`group=${group}`);
        return `[[image:${item.getAttribute("data-media-id")}${options.length ? `|${options.join("|")}` : ""}]]`;
      }).join("\n");
    }
    const inline = Array.from(element.childNodes).map(inlineFromNode).join("").trim();
    if (/^H[234]$/.test(element.tagName)) return `${"#".repeat(Number(element.tagName.slice(1)))} ${inline}`;
    if (element.tagName === "BLOCKQUOTE") return inline.split("\n").map((line) => `> ${line}`).join("\n");
    if (element.tagName === "UL" || element.tagName === "OL") return Array.from(element.children).map((item, index) => `${element.tagName === "OL" ? `${index + 1}.` : "-"} ${Array.from(item.childNodes).map(inlineFromNode).join("").trim()}`).join("\n");
    return inline;
  }).filter(Boolean).join("\n\n");
}
