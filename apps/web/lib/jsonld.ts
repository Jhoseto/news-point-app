/**
 * JSON-LD builders for schema.org NewsArticle / BreadcrumbList / Organization / WebSite / Person.
 *
 * Everything is server-only — these run in the server render pass. The
 * `JsonLd` component (in `apps/web/components/json-ld.tsx`) writes the
 * output into a `<script type="application/ld+json">` tag.
 *
 * All string values pass through `escapeJsonString` so quotes, control
 * characters and stray markup cannot escape the JSON container.
 */

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
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => serializeValue(entry)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}:${serializeValue(v)}`);
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
}

export function newsMediaOrganization(options: NewsMediaOrganizationOptions): JsonLdObject {
  const { origin, logoUrl } = options;
  return {
    "@type": "NewsMediaOrganization",
    "@id": `${origin}/#organization`,
    name: "NewsPoint.bg",
    url: origin,
    logo: logoUrl ?? `${origin}/brand/logo.webp`,
    slogan: "Гласът на истината",
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
  authorUrl?: string | undefined;
  sectionName?: string | undefined;
  wordCount?: number | undefined;
  inLanguage?: string | undefined;
}

export function newsArticle(input: NewsArticlePayload): JsonLdObject {
  const headline = clampHeadline(input.title);
  const description = input.excerpt?.trim() || null;
  const article: Record<string, unknown> = {
    "@type": "NewsArticle",
    "@id": `${input.origin}${input.path}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${input.origin}${input.path}`,
    },
    headline,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: input.authorUrl
      ? { "@type": "Person", name: input.authorName, url: input.authorUrl }
      : { "@type": "Person", name: input.authorName },
    publisher: { "@id": input.organizationId },
    inLanguage: input.inLanguage ?? "bg-BG",
  };
  if (description) article.description = description;
  if (input.imageUrl) article.image = [input.imageUrl];
  if (input.sectionName) article.articleSection = input.sectionName;
  if (typeof input.wordCount === "number" && input.wordCount > 0) article.wordCount = input.wordCount;
  return article;
}

const HEADLINE_MAX = 110;

function clampHeadline(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= HEADLINE_MAX) return trimmed;
  return `${trimmed.slice(0, HEADLINE_MAX - 1).trimEnd()}…`;
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
  if (input.publicProfile) person.url = `${input.origin}/team/`;
  return person;
}