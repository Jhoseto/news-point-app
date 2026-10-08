/**
 * JSON-LD builders for schema.org NewsArticle / BreadcrumbList / Organization / WebSite / Person.
 *
 * Everything is server-only — these run in the server render pass. The
 * `JsonLd` component (in `apps/web/components/json-ld.tsx`) writes the
 * output into a `<script type="application/ld+json">` tag.
 *
 * Values are JSON encoded; '<' is escaped so text cannot close the script tag.
 */

import type { PublicEpisode } from "./podcast-types";

export type JsonLdObject = Record<string, unknown>;

/** @return JSON-safe string value (quotes, backslashes, control characters). */
export function escapeJsonString(value: string): string {
  if (value === undefined) return "";
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

/** Serialise an LD value (string, number, boolean, null, object, array). */
export function serializeValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value).replace(/</g, "\\u003c");
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => serializeValue(entry)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${serializeValue(k)}:${serializeValue(v)}`);
    return `{${entries.join(",")}}`;
  }
  return "null";
}

/** Wrap an array of objects in a `@graph` envelope so they all live under one script tag. */
export function serializeGraph(objects: JsonLdObject[]): string {
  if (objects.length === 0) return "";
  if (objects.length === 1) return serializeValue({ ...objects[0], "@context": "https://schema.org" });
  return serializeValue({ "@context": "https://schema.org", "@graph": objects });
}

export interface NewsMediaOrganizationOptions {
  origin: string;
  logoUrl?: string;
  contact?: { phone: string; email: string; street: string; city: string; countryCode: string };
}

export function newsMediaOrganization(options: NewsMediaOrganizationOptions): JsonLdObject {
  const { origin, logoUrl } = options;
  return {
    "@type": "NewsMediaOrganization",
    "@id": `${origin}/#organization`,
    name: "NewsPoint.bg",
    url: origin,
    logo: logoUrl ?? `${origin}/brand/newspoint-logo.webp`,
    slogan: "Гласът на истината",
    ...(options.contact ? {
      email: options.contact.email,
      telephone: options.contact.phone,
      address: { "@type": "PostalAddress", streetAddress: options.contact.street, addressLocality: options.contact.city, addressCountry: options.contact.countryCode },
    } : {}),
  };
}

export function webSite(origin: string, organizationId: string): JsonLdObject {
  return {
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: "NewsPoint.bg",
    url: origin,
    publisher: { "@id": organizationId },
    inLanguage: "bg-BG",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${origin}/search/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  path?: string;
}

export function collectionPage(input: { origin: string; path: string; title: string; description: string; items: { path: string; title: string }[] }): JsonLdObject {
  return {
    "@type": "CollectionPage", "@id": `${input.origin}${input.path}`, url: `${input.origin}${input.path}`,
    name: input.title, description: input.description, inLanguage: "bg-BG",
    isPartOf: { "@id": `${input.origin}/#website` },
    mainEntity: { "@type": "ItemList", itemListElement: input.items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.title, url: `${input.origin}${item.path}` })) },
  };
}

export function breadcrumbList(origin: string, items: BreadcrumbItem[]): JsonLdObject {
  const listItems = items.map((item, index) => {
    const node: Record<string, unknown> = {
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
    };
    if (item.path) {
      const absolute = item.path.startsWith("http") ? item.path : `${origin}${item.path.startsWith("/") ? "" : "/"}${item.path}`;
      node.item = absolute;
    }
    return node;
  });
  return {
    "@type": "BreadcrumbList",
    itemListElement: listItems,
  };
}

export interface NewsArticlePayload {
  origin: string;
  organizationId: string;
  path: string;
  title: string;
  excerpt: string;
  imageUrl?: string | undefined;
  datePublished: string;
  dateModified: string;
  authorName: string;
  authorType?: "Person" | "Organization";
  authorId?: string;
  authorUrl?: string | undefined;
  sectionName?: string | undefined;
  wordCount?: number | undefined;
  inLanguage?: string | undefined;
}

export function newsArticle(input: NewsArticlePayload): JsonLdObject {
  const headline = input.title.trim();
  const description = input.excerpt?.trim() || null;
  const article: Record<string, unknown> = {
    "@type": "NewsArticle",
    "@id": `${input.origin}${input.path}`,
    url: `${input.origin}${input.path}`,
    isPartOf: { "@id": `${input.origin}/#website` },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${input.origin}${input.path}`,
    },
    headline,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: {
      "@type": input.authorType ?? "Person",
      ...(input.authorId ? { "@id": input.authorId } : {}),
      name: input.authorName,
      ...(input.authorUrl ? { url: input.authorUrl } : {}),
    },
    publisher: { "@id": input.organizationId },
    inLanguage: input.inLanguage ?? "bg-BG",
  };
  if (description) article.description = description;
  if (input.imageUrl) article.image = [input.imageUrl];
  if (input.sectionName) article.articleSection = input.sectionName;
  if (typeof input.wordCount === "number" && input.wordCount > 0) article.wordCount = input.wordCount;
  return article;
}

export interface PersonPayload {
  origin: string;
  slug: string;
  name: string;
  jobTitle?: string | undefined;
  bio?: string | undefined;
  imageUrl?: string | undefined;
  organizationId: string;
  publicProfile: boolean;
}

export function person(input: PersonPayload): JsonLdObject {
  const person: Record<string, unknown> = {
    "@type": "Person",
    "@id": `${input.origin}/team/#${input.slug}`,
    name: input.name,
    worksFor: { "@id": input.organizationId },
  };
  if (input.jobTitle) person.jobTitle = input.jobTitle;
  if (input.bio) person.description = input.bio;
  if (input.imageUrl) person.image = input.imageUrl;
  if (input.publicProfile) person.url = `${input.origin}/team/#${input.slug}`;
  return person;
}

export function podcastSeries(origin: string, description: string, episodes: Pick<PublicEpisode, "path" | "title">[]): JsonLdObject {
  const url = `${origin}/livepoint/podcast/`;
  return {
    "@type": "PodcastSeries", "@id": `${url}#series`, url,
    name: "NewsPodcast", description, inLanguage: "bg-BG",
    publisher: { "@id": `${origin}/#organization` },
    isPartOf: { "@id": `${origin}/#website` },
    // Only episodes represented in the visible page, without an invented total or numbering.
    hasPart: episodes.map((episode) => ({ "@type": "PodcastEpisode", "@id": `${origin}${episode.path}#episode`, url: `${origin}${episode.path}`, name: episode.title })),
  };
}

export function podcastEpisode(origin: string, episode: PublicEpisode): JsonLdObject {
  const url = `${origin}${episode.path}`;
  const duration = Number.isFinite(episode.durationSec) && episode.durationSec > 0 ? `PT${episode.durationSec}S` : undefined;
  return {
    "@type": "PodcastEpisode", "@id": `${url}#episode`, url,
    name: episode.title, description: episode.summary, datePublished: episode.publishedAt,
    image: new URL(episode.coverUrl, origin).href, inLanguage: "bg-BG",
    publisher: { "@id": `${origin}/#organization` },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    partOfSeries: { "@id": `${origin}/livepoint/podcast/#series` },
    ...(duration ? { duration } : {}),
    audio: {
      "@type": "AudioObject", "@id": `${url}#audio`,
      name: episode.title, contentUrl: new URL(episode.audioUrl, origin).href,
      inLanguage: "bg-BG", ...(duration ? { duration } : {}),
      encodesCreativeWork: { "@id": `${url}#episode` },
    },
  };
}
