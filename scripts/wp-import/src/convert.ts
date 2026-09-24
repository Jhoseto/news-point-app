import render from "dom-serializer";
import { type ChildNode, type Element, isTag, isText } from "domhandler";
import { parseDocument } from "htmlparser2";
import sanitizeHtml from "sanitize-html";
import type { Block } from "@newspoint/content";
import { htmlToPlainText } from "./text";

export interface DraftImage {
  src: string;
  width: number | null;
  height: number | null;
  alt: string;
}

// Image blocks reference images[] by index until the media assets exist.
export type DraftBlock =
  | Exclude<Block, { type: "image" }>
  | { type: "image"; imageIndex: number; caption?: string };

export interface ConversionNote {
  kind: "legacy_html" | "dropped_script" | "dropped_iframe" | "empty_embed";
  detail: string;
}

export interface Conversion {
  blocks: DraftBlock[];
  images: DraftImage[];
  notes: ConversionNote[];
}

const INLINE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["strong", "b", "em", "i", "u", "a", "br", "sub", "sup", "mark"],
  allowedAttributes: { a: ["href", "title", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target === "_blank" ? { ...attribs, rel: "noopener noreferrer" } : attribs,
    }),
  },
};

const LEGACY_OPTIONS: sanitizeHtml.IOptions = {
  ...INLINE_OPTIONS,
  allowedTags: [
    ...(INLINE_OPTIONS.allowedTags as string[]),
    "p", "div", "span", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
    "ul", "ol", "li", "hr", "h2", "h3", "h4", "blockquote", "pre", "code",
  ],
  allowedAttributes: { ...INLINE_OPTIONS.allowedAttributes, th: ["colspan", "rowspan"], td: ["colspan", "rowspan"] },
};

function inlineHtml(nodes: ChildNode[]): string {
  const html = sanitizeHtml(render(nodes), INLINE_OPTIONS)
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/(<br\s*\/?>\s*)+$/i, "")
    .trim();
  return htmlToPlainText(html) ? html : "";
}

function headingText(el: Element): string {
  return htmlToPlainText(render(el.children)).replace(/[<>]/g, "");
}

function headingLevel(name: string): 2 | 3 | 4 {
  if (name === "h1" || name === "h2") return 2;
  if (name === "h3") return 3;
  return 4;
}

function embedProvider(url: URL): Extract<Block, { type: "embed" }>["provider"] {
  const host = url.hostname.replace(/^www\./, "");
  if (/(^|\.)youtube(-nocookie)?\.com$|^youtu\.be$/.test(host)) return "youtube";
  if (/(^|\.)facebook\.com$/.test(host)) return "facebook";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(twitter|x)\.com$/.test(host)) return "x";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  return "other";
}

function descendants(nodes: ChildNode[], predicate: (el: Element) => boolean): Element[] {
  const found: Element[] = [];
  for (const node of nodes) {
    if (!isTag(node)) continue;
    if (predicate(node)) found.push(node);
    else found.push(...descendants(node.children, predicate));
  }
  return found;
}

function withoutMedia(nodes: ChildNode[]): ChildNode[] {
  return nodes.filter((node) => !(isTag(node) && ["img", "iframe", "script", "figure"].includes(node.name)));
}

export function convertWordPressHtml(html: string, baseUrl: string): Conversion {
  const blocks: DraftBlock[] = [];
  const images: DraftImage[] = [];
  const notes: ConversionNote[] = [];

  const absolute = (value: string | undefined): URL | null => {
    if (!value) return null;
    try {
      return new URL(value, baseUrl);
    } catch {
      return null;
    }
  };

  const addImage = (img: Element, caption?: string) => {
    const src = absolute(img.attribs.src);
    if (!src) return;
    const toNumber = (value: string | undefined) => (value && /^\d+$/.test(value) ? Number(value) : null);
    images.push({
      src: src.href,
      width: toNumber(img.attribs.width),
      height: toNumber(img.attribs.height),
      alt: htmlToPlainText(img.attribs.alt ?? ""),
    });
    blocks.push(caption ? { type: "image", imageIndex: images.length - 1, caption } : { type: "image", imageIndex: images.length - 1 });
  };

  const addEmbed = (rawUrl: string | undefined, source: string) => {
    const url = absolute(rawUrl);
    if (!url) {
      notes.push({ kind: "empty_embed", detail: source });
      return;
    }
    if (url.protocol !== "https:") {
      notes.push({ kind: "dropped_iframe", detail: `non-https ${url.href}` });
      return;
    }
    blocks.push({ type: "embed", provider: embedProvider(url), url: url.href });
  };

  const addLegacy = (el: Element) => {
    const cleaned = sanitizeHtml(render(el), LEGACY_OPTIONS).trim();
    if (!htmlToPlainText(cleaned)) return;
    blocks.push({ type: "legacy_html", html: cleaned });
    notes.push({ kind: "legacy_html", detail: `<${el.name}${el.attribs.class ? ` class="${el.attribs.class}"` : ""}>` });
  };

  const extractMedia = (nodes: ChildNode[]) => {
    for (const el of descendants(nodes, (node) => ["img", "iframe", "script"].includes(node.name))) {
      if (el.name === "img") addImage(el);
      else if (el.name === "iframe") addEmbed(el.attribs.src, "iframe without src");
      else notes.push({ kind: "dropped_script", detail: el.attribs.src ?? "inline script" });
    }
  };

  const visit = (node: ChildNode) => {
    if (isText(node)) {
      const text = inlineHtml([node]);
      if (text) blocks.push({ type: "paragraph", html: text });
      return;
    }
    if (!isTag(node)) return;

    switch (node.name) {
      case "p": {
        extractMedia(node.children);
        const text = inlineHtml(withoutMedia(node.children));
        if (text) blocks.push({ type: "paragraph", html: text });
        return;
      }
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const text = headingText(node);
        if (text) blocks.push({ type: "heading", level: headingLevel(node.name), text });
        return;
      }
      case "ul":
      case "ol": {
        const items = node.children
          .filter((child): child is Element => isTag(child) && child.name === "li")
          .map((li) => inlineHtml(li.children))
          .filter(Boolean);
        if (items.length) blocks.push({ type: "list", ordered: node.name === "ol", items });
        return;
      }
      case "blockquote": {
        const className = node.attribs.class ?? "";
        if (/twitter-tweet|instagram-media|tiktok-embed/.test(className)) {
          const links = descendants(node.children, (el) => el.name === "a");
          addEmbed(node.attribs["data-instgrm-permalink"] ?? node.attribs.cite ?? links.at(-1)?.attribs.href, className);
          return;
        }
        const paragraphs = descendants(node.children, (el) => el.name === "p");
        const html = paragraphs.length
          ? paragraphs.map((p) => inlineHtml(p.children)).filter(Boolean).join("<br><br>")
          : inlineHtml(node.children);
        if (html) blocks.push({ type: "quote", html });
        return;
      }
      case "figure": {
        const img = descendants(node.children, (el) => el.name === "img")[0];
        const caption = descendants(node.children, (el) => el.name === "figcaption")[0];
        if (img) {
          const captionText = caption ? headingText(caption) : "";
          addImage(img, captionText || undefined);
          return;
        }
        const iframe = descendants(node.children, (el) => el.name === "iframe")[0];
        if (iframe) {
          addEmbed(iframe.attribs.src, "figure iframe");
          return;
        }
        const wrapperText = htmlToPlainText(render(node.children));
        if (/^https:\/\/\S+$/.test(wrapperText)) {
          addEmbed(wrapperText, "figure url");
          return;
        }
        addLegacy(node);
        return;
      }
      case "img":
        addImage(node);
        return;
      case "iframe":
        addEmbed(node.attribs.src, "iframe without src");
        return;
      case "script":
        notes.push({ kind: "dropped_script", detail: node.attribs.src ?? "inline script" });
        return;
      case "div":
      case "section":
      case "article":
      case "span":
        node.children.forEach(visit);
        return;
      case "br":
        return;
      default:
        addLegacy(node);
    }
  };

  parseDocument(html).children.forEach(visit);
  return { blocks, images, notes };
}
