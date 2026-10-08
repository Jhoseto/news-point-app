/** Inspect actual server HTML, not client DOM or Next's serialized hydration payload. */
export function decode(value: string): string {
  return value.replace(/&(?:amp|quot|lt|gt|apos|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const named = ({ "&amp;": "&", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&apos;": "'" } as Record<string, string>)[entity.toLowerCase()];
    if (named !== undefined) return named;
    const code = entity.toLowerCase().startsWith("&#x") ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}
function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [match[1]!, decode(match[2] ?? match[3]!)]));
}
export function inspectSeoHtml(html: string) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const document = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const metas = [...document.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const links = [...document.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const anchors = [...document.matchAll(/<a\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const meta = (name: string) => metas.filter((entry) => entry.name === name || entry.property === name).map((entry) => entry.content ?? "");
  const errors: string[] = [];
  const jsonLd: Record<string, unknown>[] = [];
  for (const script of scripts) {
    if (attributes(script[1]!).type !== "application/ld+json") continue;
    try {
      const graph = JSON.parse(script[2]!);
      jsonLd.push(...(graph["@graph"] ?? [graph]));
    } catch { errors.push("Invalid JSON-LD"); }
  }
  for (const article of jsonLd.filter((node) => node["@type"] === "NewsArticle")) {
    if (!article.headline || !article.author || !article.publisher) errors.push("NewsArticle missing headline, author or publisher");
    for (const key of ["datePublished", "dateModified"]) if (typeof article[key] !== "string" || Number.isNaN(Date.parse(article[key]))) errors.push(`NewsArticle invalid ${key}`);
    if (Array.isArray(article.image)) for (const image of article.image) {
      try { const url = new URL(String(image)); if (!["http:", "https:"].includes(url.protocol)) errors.push("NewsArticle invalid image protocol"); }
      catch { errors.push("NewsArticle invalid image URL"); }
    }
  }
  return {
    titles: [...document.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((match) => decode(match[1]!)),
    descriptions: meta("description"),
    canonicals: links.filter((link) => link.rel === "canonical").map((link) => link.href ?? ""),
    ogTitle: meta("og:title"), ogDescription: meta("og:description"), ogUrl: meta("og:url"), ogImages: meta("og:image"),
    twitterCard: meta("twitter:card"), robots: meta("robots"),
    headlines: [...document.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => decode(match[1]!.replace(/<[^>]*>/g, ""))),
    headCanonicals: [...(document.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "").matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0])).filter((link) => link.rel === "canonical").map((link) => link.href),
    shareUrls: anchors.flatMap((anchor) => {
      try { const url = new URL(anchor.href ?? ""); return url.hostname === "www.facebook.com" && url.pathname === "/sharer/sharer.php" ? [url.searchParams.get("u") ?? ""] : []; }
      catch { return []; }
    }),
    jsonLdTypes: jsonLd.map((node) => String(node["@type"])), errors,
    articleHeadlines: jsonLd.filter((node) => node["@type"] === "NewsArticle").map((node) => String(node.headline)),
  };
}
