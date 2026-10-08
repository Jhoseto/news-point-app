/** Inspect actual server HTML, not client DOM or Next's serialized hydration payload. */
function decode(value: string): string {
  return value.replace(/&(?:amp|quot|lt|gt|apos|#39);/g, (entity) => ({ "&amp;": "&", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&apos;": "'", "&#39;": "'" })[entity]!);
}
function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)=["']([^"']*)["']/g)].map((match) => [match[1]!, decode(match[2]!)]));
}
export function inspectSeoHtml(html: string) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const document = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const metas = [...document.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const links = [...document.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]));
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
    jsonLdTypes: jsonLd.map((node) => String(node["@type"])), errors,
  };
}
