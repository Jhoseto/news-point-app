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
  const podcastEpisodes = jsonLd.filter((node) => node["@type"] === "PodcastEpisode");
  for (const episode of podcastEpisodes) {
    if (!episode.name || !episode.publisher || !episode.partOfSeries) errors.push("PodcastEpisode missing name, publisher or series");
    if (typeof episode.datePublished !== "string" || Number.isNaN(Date.parse(episode.datePublished))) errors.push("PodcastEpisode invalid datePublished");
    const audio = episode.audio as Record<string, unknown> | undefined;
    try {
      if (audio?.["@type"] !== "AudioObject" || !["http:", "https:"].includes(new URL(String(audio.contentUrl)).protocol)) errors.push("PodcastEpisode invalid AudioObject");
    } catch { errors.push("PodcastEpisode invalid AudioObject"); }
  }
  const people = jsonLd.filter((node) => node["@type"] === "Person");
  const elementIds = new Set([...document.matchAll(/<[a-z][^>]*>/gi)].flatMap((tag) => attributes(tag[0]).id ?? []));
  const canonical = links.find((link) => link.rel === "canonical")?.href;
  for (const person of people) {
    if (typeof person.url !== "string" || !canonical || !person.url.startsWith(`${canonical}#`)) continue;
    if (!elementIds.has(decodeURIComponent(new URL(person.url).hash.slice(1)))) errors.push("Person URL does not identify a visible profile");
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
    articleAuthors: jsonLd.filter((node) => node["@type"] === "NewsArticle").map((node) => node.author as { "@type": string; "@id"?: string; name: string; url?: string }),
    personUrls: people.flatMap((node) => typeof node.url === "string" ? [node.url] : []),
    podcastSeriesIds: jsonLd.filter((node) => node["@type"] === "PodcastSeries").map((node) => String(node["@id"])),
    podcastEpisodes: podcastEpisodes.map((node) => ({ url: node.url, name: node.name, publishedAt: node.datePublished, seriesId: (node.partOfSeries as Record<string, unknown> | undefined)?.["@id"], audioUrl: (node.audio as Record<string, unknown> | undefined)?.contentUrl })),
  };
}
