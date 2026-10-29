import sanitizeHtml from "sanitize-html";

export function plainSmartHtml(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {}, nonTextTags: ["script", "style", "textarea", "noscript", "nav", "footer", "header"] }).replace(/\s+/g, " ").trim();
}
export function smartArticleText(body: unknown) {
  if (!Array.isArray(body)) return "";
  return body.flatMap((block: Record<string, unknown>) => {
    if (["paragraph", "quote", "heading"].includes(String(block.type))) return [plainSmartHtml(String(block.html ?? block.text ?? ""))];
    if (block.type === "list" && Array.isArray(block.items)) return block.items.map(x => plainSmartHtml(String(x)));
    return [];
  }).filter(Boolean).join("\n\n");
}
export function smartChunks(text: string, length = 4500) {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += length - 400) chunks.push(text.slice(start, start + length));
  return chunks;
}
