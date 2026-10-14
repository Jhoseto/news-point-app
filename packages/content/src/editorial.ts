import type { ArticleBody, Block } from "./blocks";
import sanitizeHtml from "sanitize-html";

export type EmbedProvider = "youtube" | "facebook" | "instagram" | "x" | "tiktok" | "vimeo" | "reddit" | "other";
export const EMBED_PROVIDER_LABEL: Record<EmbedProvider, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", x: "X", tiktok: "TikTok", vimeo: "Vimeo", reddit: "Reddit", other: "външен източник" };
const LOCAL_VIDEO = /^\/media\/news\/\d{4}\/(?:0[1-9]|1[0-2])\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.mp4$/i;

export function localVideoUrl(value: string): string | null {
  return LOCAL_VIDEO.test(value) ? value : null;
}
export function videoSourceUrl(value: string): string | null {
  if (localVideoUrl(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && /\.(?:mp4|webm)$/i.test(url.pathname) ? url.href : null;
  } catch { return null; }
}
export function embedProviderFromUrl(value: string): EmbedProvider {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^(www|m)\./, "");
    if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") return "youtube";
    if (host === "facebook.com") return "facebook";
    if (host === "instagram.com") return "instagram";
    if (host === "x.com" || host === "twitter.com") return "x";
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
    if (host === "vimeo.com" || host === "player.vimeo.com") return "vimeo";
    if (["reddit.com", "old.reddit.com", "embed.reddit.com", "redditmedia.com"].includes(host)) return "reddit";
  } catch { /* invalid */ }
  return "other";
}

/** Only vetted provider endpoints become iframes. Other HTTPS URLs remain links. */
export function embedFrameUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const provider = embedProviderFromUrl(value);
    if (provider === "youtube") {
      const id = url.hostname === "youtu.be" ? url.pathname.slice(1).split("/")[0]
        : /^\/(embed|shorts|live)\//.test(url.pathname) ? url.pathname.split("/")[2] : url.searchParams.get("v");
      if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
      const frame = new URL(`https://www.youtube.com/embed/${id}`);
      const start = url.searchParams.get("start") ?? url.searchParams.get("t");
      if (start && /^\d+$/.test(start)) frame.searchParams.set("start", start);
      return frame.href;
    }
    if (provider === "facebook") {
      const plugin = /^\/plugins\/(video|post)\.php$/.exec(url.pathname);
      const target = plugin ? url.searchParams.get("href") : value;
      if (!target || embedProviderFromUrl(target) !== "facebook") return null;
      const targetUrl = new URL(target);
      if (targetUrl.protocol !== "https:" || targetUrl.username || targetUrl.password) return null;
      const frame = new URL(`https://www.facebook.com/plugins/${plugin?.[1] ?? (/\/videos\/|\/watch\/?/.test(url.pathname) ? "video" : "post")}.php`);
      frame.searchParams.set("href", target);
      frame.searchParams.set("show_text", url.searchParams.get("show_text") ?? "false");
      const dimension = (key: string, fallback: number) => { const value = Number(url.searchParams.get(key)); return String(Number.isFinite(value) && value >= 200 ? Math.min(1200, Math.round(value)) : fallback); };
      frame.searchParams.set("width", dimension("width", 560));
      frame.searchParams.set("height", dimension("height", frame.pathname.includes("post.php") ? 560 : 315));
      const t = url.searchParams.get("t");
      if (t && /^\d+$/.test(t)) frame.searchParams.set("t", t);
      return frame.href;
    }
    if (provider === "vimeo") {
      const id = url.hostname === "player.vimeo.com" ? /^\/video\/(\d+)\/?$/.exec(url.pathname)?.[1] : /^\/(\d+)(?:\/([a-f0-9]+))?\/?$/.exec(url.pathname)?.[1];
      if (!id) return null;
      const frame = new URL(`https://player.vimeo.com/video/${id}`);
      const hash = url.searchParams.get("h") ?? (url.hostname !== "player.vimeo.com" ? /^\/\d+\/([a-f0-9]+)\/?$/.exec(url.pathname)?.[1] : null);
      if (hash && /^[a-f0-9]{6,64}$/i.test(hash)) frame.searchParams.set("h", hash);
      return frame.href;
    }
    if (provider === "tiktok") {
      const id = /^\/player\/v1\/(\d+)\/?$/.exec(url.pathname)?.[1] ?? /^\/@[^/]+\/video\/(\d+)\/?$/.exec(url.pathname)?.[1];
      return id ? `https://www.tiktok.com/player/v1/${id}` : null;
    }
    if (provider === "instagram") {
      const match = /^\/(p|reel|tv)\/([A-Za-z0-9_-]+)(?:\/embed)?\/?$/.exec(url.pathname);
      return match ? `https://www.instagram.com/${match[1]}/${match[2]}/embed/` : null;
    }
    if (provider === "reddit") {
      // Same post/comment routes used by Reddit's official widgets.js. Never
      // forward tracking, redirects, or arbitrary embed options from the paste.
      const post = /^\/(r|user)\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)\/([A-Za-z0-9_-]*)(?:\/([a-z0-9]+))?\/?$/i.exec(url.pathname);
      if (!post) return null;
      const path = `/${post[1]}/${post[2]}/comments/${post[3]}/${post[4]}/${post[5] ? `${post[5]}/` : ""}`;
      return `https://embed.reddit.com${path}?embed=true&showmedia=true`;
    }
  } catch { /* invalid */ }
  return null;
}

export function embedAspectRatio(value: string): string {
  const frame = embedFrameUrl(value);
  if (frame && embedProviderFromUrl(frame) === "facebook") { const url = new URL(frame); return `${url.searchParams.get("width")}/${url.searchParams.get("height")}`; }
  if (frame && ["instagram", "tiktok"].includes(embedProviderFromUrl(frame))) return "9/16";
  if (frame && embedProviderFromUrl(frame) === "reddit") return "4/5";
  return "16/9";
}

/** Extract only a vetted post URL from Reddit's official blockquote snippet. */
function redditSnippetUrl(raw: string): string | null {
  if (!/<blockquote\b/i.test(raw)) return null;
  const sanitized = sanitizeHtml(raw, {
    allowedTags: ["blockquote", "a"],
    allowedAttributes: { blockquote: ["class"], a: ["href"] },
    allowedClasses: { blockquote: ["reddit-embed-bq"] },
    allowedSchemes: ["https"],
  });
  const quote = /<blockquote class="reddit-embed-bq">([\s\S]*?)<\/blockquote>/i.exec(sanitized)?.[1];
  if (!quote) return null;
  for (const link of quote.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)) {
    const href = link[1]!.replace(/&amp;/gi, "&");
    if (embedProviderFromUrl(href) === "reddit") {
      const frame = embedFrameUrl(href);
      if (frame) return frame;
    }
  }
  return null;
}

export function parseEmbedInput(raw: string): { url: string; provider: EmbedProvider } | null {
  const match = raw.match(/<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i);
  const value = (match?.[1] ?? redditSnippetUrl(raw) ?? raw.trim().replace(/^["']|["']$/g, "")).replace(/&amp;|&#38;/gi, "&");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
    return { url: embedFrameUrl(url.href) ?? url.href, provider: embedProviderFromUrl(url.href) };
  } catch { return null; }
}

export const RESERVED_ARTICLE_SLUGS = new Set([
  "api", "_next", "brand", "draft", "login", "search", "tag", "author", "page", "feed", "share",
  "admin", "media", "team", "temi", "contacts", "advertising", "settings", "offline", "livepoint",
  "podcast", "podcast-audio", "news-podcast", "sitemaps", "llms.txt", "sitemap.xml", "robots.txt", "wp-admin", "wp-content", "wp-json",
]);
export function publicationProblems(draft: {
  title: string; slug: string; bodyBlocks: number; primaryCategoryId: string | null; heroMediaId: string | null;
  heroEmbedUrl?: string | null; authorKind: string; authorName: string;
}): string[] {
  const problems: string[] = [];
  if (draft.title.trim().length < 5) problems.push("Заглавието е твърде кратко.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) problems.push("Липсва адрес на статията.");
  else if (RESERVED_ARTICLE_SLUGS.has(draft.slug)) problems.push("Този адрес е запазен. Изберете друг.");
  if (draft.bodyBlocks === 0) problems.push("Текстът е празен.");
  if (!draft.primaryCategoryId) problems.push("Изберете рубрика.");
  if (draft.heroEmbedUrl ? !embedFrameUrl(draft.heroEmbedUrl) && !videoSourceUrl(draft.heroEmbedUrl) : !draft.heroMediaId) problems.push("Изберете основна снимка или поддържан водещ embed.");
  if (draft.authorKind === "manual" && (draft.authorName.trim().length < 2 || draft.authorName.length > 120 || /[<>\u0000-\u001f\u007f]/u.test(draft.authorName))) problems.push("Въведете валидно име на автора.");
  return problems;
}

export function bodyGroups(blocks: ArticleBody): { index: number; blocks: Block[] }[] {
  const groups: { index: number; blocks: Block[] }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const group = { index: i, blocks: [block] };
    if (block.type === "image" && block.groupId) {
      while (i + 1 < blocks.length) {
        const next = blocks[i + 1]!;
        if (next.type !== "image" || next.groupId !== block.groupId) break;
        group.blocks.push(next); i++;
      }
    }
    groups.push(group);
  }
  return groups;
}

export function mediaWidth(block: Extract<Block, { type: "image" | "embed" }>): number {
  return block.widthPercent ?? (block.type === "image" ? { small: 35, medium: 60, large: 82, full: 100 }[block.size ?? "large"] : 100);
}

export function composition(block: Block): { className: string; style: Record<string, string | number> } {
  const media = block.type === "image" || block.type === "embed";
  const width = media ? mediaWidth(block) : undefined;
  const wrap = media && block.wrap && block.wrap !== "none" && (width ?? 50) <= 50 ? block.wrap : "none";
  return {
    className: `np-composition${media ? " np-composition-media" : ""}${wrap !== "none" ? ` np-wrap-${wrap}` : ""}`,
    style: {
      ...(width != null ? { "--np-media-width": `${width}%` } : {}),
      ...(media && wrap === "none" ? { marginInlineStart: block.align === "left" ? 0 : "auto", marginInlineEnd: block.align === "right" ? 0 : "auto" } : {}),
      ...("textAlign" in block && block.textAlign ? { textAlign: block.textAlign } : {}),
      ...("indent" in block && block.indent ? { paddingInlineStart: `${block.indent * 1.5}em` } : {}),
      ...(block.type === "paragraph" && block.clearMedia ? { clear: "both" } : {}),
    },
  };
}
