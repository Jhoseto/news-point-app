import { articleBody, bodyGroups, type ArticleBody, type Block } from "@newspoint/content";

export interface EditorDocumentNode {
  type: string; text?: string | undefined; attrs?: Record<string, unknown> | undefined;
  marks?: { type: string; attrs?: Record<string, unknown> | undefined }[] | undefined;
  content?: EditorDocumentNode[] | undefined;
}
export const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const data = (block: unknown) => escapeHtml(encodeURIComponent(JSON.stringify(block)));
const presentation = (block: Block) => ` data-indent="${"indent" in block ? block.indent ?? 0 : 0}"${"textAlign" in block && block.textAlign ? ` style="text-align:${block.textAlign}"` : ""}`;

/** Media and archive blocks carry their complete original attributes through parsing. */
export function bodyToEditorHtml(body: ArticleBody): string {
  const render = (block: Block): string => {
    const html = block.type === "list" ? block.items.join(" ") : "html" in block ? block.html ?? "" : "";
    // Protect markup that the editing schema cannot represent. Preserve its original block.
    if (block.type !== "legacy_html" && (/<\/?(?:sub|sup|mark|small|table|thead|tbody|tfoot|tr|th|td|caption|pre|hr|h[234])\b/i.test(html) || (block.type === "paragraph" && /<\/?(?:p|ul|ol|li|blockquote)\b/i.test(html)) || /<a\b[^>]*\b(?:title|target)=/i.test(html))) return `<div data-np-legacy="${data(block)}"></div>`;
    switch (block.type) {
      case "paragraph": return `<p${presentation(block)}>${block.html}</p>`;
      case "heading": return `<h${block.level}${presentation(block)}>${block.html ?? escapeHtml(block.text)}</h${block.level}>`;
      case "quote": return `<blockquote${presentation(block)} data-cite="${escapeHtml(block.cite ?? "")}">${/^\s*<(p|ul|ol|h[234])\b/.test(block.html) ? block.html : `<p>${block.html}</p>`}</blockquote>`;
      case "list": return `<${block.ordered ? "ol" : "ul"}${presentation(block)}>${block.items.map(item => `<li>${/^\s*<p\b/.test(item) ? item : `<p>${item}</p>`}</li>`).join("")}</${block.ordered ? "ol" : "ul"}>`;
      case "image": return `<figure data-np-image="${data(block)}"></figure>`;
      case "embed": return `<div data-np-embed="${data(block)}"></div>`;
      case "legacy_html": return `<div data-np-legacy="${data(block)}"></div>`;
      case "divider": return "<hr>";
    }
  };
  return bodyGroups(body).map(group => group.blocks.length > 1 ? `<div data-np-gallery="true">${group.blocks.map(render).join("")}</div>` : render(group.blocks[0]!)).join("") || "<p></p>";
}

export function inlineHtml(node: EditorDocumentNode): string {
  if (node.type === "text") {
    let value = escapeHtml(node.text ?? "");
    for (const mark of node.marks ?? []) {
      const tag: Record<string, string> = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code" };
      if (tag[mark.type]) value = `<${tag[mark.type]}>${value}</${tag[mark.type]}>`;
      else if (mark.type === "link") value = `<a href="${escapeHtml(String(mark.attrs?.href ?? ""))}">${value}</a>`;
      else if (mark.type === "npColor" && /^[a-z]+$/.test(String(mark.attrs?.color))) value = `<span class="np-text-${mark.attrs?.color}">${value}</span>`;
    }
    return value;
  }
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "horizontalRule") return "<hr>";
  const inner = (node.content ?? []).map(inlineHtml).join("");
  const tags: Record<string, string> = { paragraph: "p", bulletList: "ul", orderedList: "ol", listItem: "li", blockquote: "blockquote", codeBlock: "pre" };
  const tag = node.type === "heading" && [2, 3, 4].includes(Number(node.attrs?.level)) ? `h${node.attrs?.level}` : tags[node.type];
  if (!tag) throw new Error(`Неподдържано вложено съдържание: ${node.type}`);
  return `<${tag}>${inner}</${tag}>`;
}
const inline = (node: EditorDocumentNode) => (node.content ?? []).map(inlineHtml).join("");
const plain = (node: EditorDocumentNode): string => node.text ?? (node.type === "hardBreak" ? " " : (node.content ?? []).map(plain).join(""));
function textAttributes(node: EditorDocumentNode) {
  if (["blockquote", "bulletList", "orderedList"].includes(node.type)) { let first = node.content?.[0]; if (first?.type === "listItem") first = first.content?.[0]; node = { ...node, attrs: { ...first?.attrs, ...Object.fromEntries(Object.entries(node.attrs ?? {}).filter(([, value]) => value !== null && value !== 0)) } }; }
  return { ...(node.attrs?.textAlign && node.attrs.textAlign !== "left" ? { textAlign: node.attrs.textAlign } : {}), ...(Number(node.attrs?.indent) > 0 ? { indent: node.attrs?.indent } : {}) };
}

export function documentToBody(doc: EditorDocumentNode): ArticleBody {
  const result: unknown[] = [];
  for (const node of doc.content ?? []) {
    const attrs = node.attrs ?? {};
    switch (node.type) {
      case "paragraph": if (inline(node).trim()) result.push({ type: "paragraph", html: inline(node), ...textAttributes(node) }); break;
      case "heading": result.push({ type: "heading", level: attrs.level, text: plain(node), ...(node.content?.some(item => item.marks?.length) ? { html: inline(node) } : {}), ...textAttributes(node) }); break;
      case "blockquote": result.push({ type: "quote", html: inline(node), ...(attrs.cite ? { cite: attrs.cite } : {}), ...textAttributes(node) }); break;
      case "bulletList": case "orderedList": result.push({ type: "list", ordered: node.type === "orderedList", items: (node.content ?? []).map(inline), ...textAttributes(node) }); break;
      case "horizontalRule": result.push({ type: "divider" }); break;
      case "npImage": case "npEmbed": case "npLegacy": result.push(attrs.block); break;
      case "npGallery": result.push(...(node.content ?? []).map(item => item.attrs?.block)); break;
      // Existing code blocks remain sanitized archive blocks; never silently discard content.
      case "codeBlock": result.push({ type: "legacy_html", html: inlineHtml(node) }); break;
      default: throw new Error(`Неподдържан блок: ${node.type}`);
    }
  }
  return articleBody.parse(result);
}

export function documentWords(body: ArticleBody): number {
  return body.map(block => block.type === "heading" ? block.text : block.type === "list" ? block.items.join(" ") : "html" in block ? block.html : "").join(" ").replace(/<[^>]*>/g, " ").match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}
