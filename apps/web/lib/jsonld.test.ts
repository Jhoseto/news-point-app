import { describe, expect, it } from "vitest";
import {
  breadcrumbList,
  collectionPage,
  escapeJsonString,
  newsArticle,
  newsMediaOrganization,
  person,
  serializeGraph,
  serializeValue,
  webSite,
} from "./jsonld";

const ORIGIN = "https://newspoint.bg";

describe("escapeJsonString", () => {
  it("escapes backslashes", () => {
    expect(escapeJsonString("a\\b")).toBe("a\\\\b");
  });
  it("escapes double quotes", () => {
    expect(escapeJsonString('каза "здравей"')).toBe('каза \\"здравей\\"');
  });
  it("escapes newlines, carriage returns and tabs", () => {
    expect(escapeJsonString("a\nb\rc\td")).toBe("a\\nb\\rc\\td");
  });
  it("strips control characters", () => {
    expect(escapeJsonString("a\u0000b\u0001c\u001fd")).toBe("abcd");
  });
  it("keeps Bulgarian Cyrillic and Unicode characters", () => {
    expect(escapeJsonString("Заглавие на статия")).toBe("Заглавие на статия");
  });
});

describe("serializeValue", () => {
  it("encodes strings safely", () => {
    expect(serializeValue('казвам "свят"')).toBe('"казвам \\"свят\\""');
  });
  it("encodes nested objects", () => {
    expect(serializeValue({ a: 1, b: ["x", "y"] })).toBe('{"a":1,"b":["x","y"]}');
  });
  it("renders null for undefined", () => {
    expect(serializeValue(undefined)).toBe("null");
  });
});

describe("serializeGraph", () => {
  it("cannot break out of a script element and preserves the original string when parsed", () => {
    const name = '</script><script>alert("x")</script>';
    const out = serializeGraph([{ "@type": "Thing", name, [name]: "value" }]);
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe(name);
    expect(JSON.parse(out)[name]).toBe("value");
  });
  it("returns empty string when there are no objects", () => {
    expect(serializeGraph([])).toBe("");
  });

  it("renders a single object with @context prepended", () => {
    const out = serializeGraph([{ "@type": "Thing", name: "thing" }]);
    expect(out).toContain('"@context":"https://schema.org"');
    expect(out).toContain('"@type":"Thing"');
  });

  it("uses @graph for multiple objects", () => {
    const out = serializeGraph([
      { "@type": "Thing", name: "one" },
      { "@type": "Thing", name: "two" },
    ]);
    expect(out).toContain('"@graph"');
    expect(out).toContain('"name":"one"');
    expect(out).toContain('"name":"two"');
  });
});

describe("newsMediaOrganization", () => {
  it("includes only supplied public contact details", () => {
    const contact = { phone: "fixture-phone", email: "fixture@example.test", street: "Fixture street", city: "Fixture city", countryCode: "BG" };
    expect(newsMediaOrganization({ origin: ORIGIN, contact })).toMatchObject({ email: contact.email, telephone: contact.phone, address: { "@type": "PostalAddress", addressCountry: "BG" } });
    expect(newsMediaOrganization({ origin: ORIGIN })).not.toHaveProperty("email");
  });
  it("returns a stable @id and logo path", () => {
    const out = newsMediaOrganization({ origin: ORIGIN });
    expect(out["@type"]).toBe("NewsMediaOrganization");
    expect(out["@id"]).toBe(`${ORIGIN}/#organization`);
    expect(out["url"]).toBe(ORIGIN);
    expect(out["logo"]).toBe(`${ORIGIN}/brand/newspoint-logo.webp`);
  });
});

describe("webSite", () => {
  it("links the publisher and the search action", () => {
    const out = webSite(ORIGIN, `${ORIGIN}/#organization`);
    expect(out["@type"]).toBe("WebSite");
    expect(out["inLanguage"]).toBe("bg-BG");
    expect(out["publisher"]).toEqual({ "@id": `${ORIGIN}/#organization` });
    const action = out["potentialAction"] as { target: { urlTemplate: string } };
    expect(action.target.urlTemplate).toBe(`${ORIGIN}/search/?q={search_term_string}`);
  });
});

describe("breadcrumbList", () => {
  it("describes the rendered theme order without fabricated members", () => {
    const page = collectionPage({ origin: ORIGIN, path: "/temi/fixture/", title: "Fixture", description: "Test only", items: [{ path: "/second/", title: "Second fixture" }, { path: "/first/", title: "First fixture" }] });
    expect(page).toMatchObject({ "@type": "CollectionPage", url: `${ORIGIN}/temi/fixture/`, mainEntity: { "@type": "ItemList", itemListElement: [{ position: 1, url: `${ORIGIN}/second/` }, { position: 2, url: `${ORIGIN}/first/` }] } });
  });
  it("starts with the home page and uses absolute URLs", () => {
    const out = breadcrumbList(ORIGIN, [
      { name: "Начало", path: "/" },
      { name: "Пловдив", path: "/plovdiv/" },
      { name: "Тестова статия", path: "/test-na-statie/" },
    ]) as { "@type": string; itemListElement: Array<Record<string, unknown>> };
    expect(out["@type"]).toBe("BreadcrumbList");
    expect(out.itemListElement).toHaveLength(3);
    expect(out.itemListElement[0]?.["item"]).toBe(`${ORIGIN}/`);
    expect(out.itemListElement[2]?.["item"]).toBe(`${ORIGIN}/test-na-statie/`);
  });

  it("omits the item field for the current page", () => {
    const out = breadcrumbList(ORIGIN, [{ name: "Екип" }]) as {
      itemListElement: Array<Record<string, unknown>>;
    };
    expect(out.itemListElement[0]?.["item"]).toBeUndefined();
    expect(out.itemListElement[0]?.["name"]).toBe("Екип");
  });
});

describe("newsArticle", () => {
  it("builds the canonical NewsArticle shape", () => {
    const out = newsArticle({
      origin: ORIGIN,
      organizationId: `${ORIGIN}/#organization`,
      path: "/test-na-statie/",
      title: "Тестова статия",
      excerpt: "Резюме на статията.",
      imageUrl: `${ORIGIN}/media/news/2024/01/foo.jpg`,
      datePublished: "2024-01-01T10:00:00.000Z",
      dateModified: "2024-01-02T12:00:00.000Z",
      authorName: "Иван Петров",
      sectionName: "Пловдив",
      wordCount: 420,
    });
    expect(out["@type"]).toBe("NewsArticle");
    expect(out["@id"]).toBe(`${ORIGIN}/test-na-statie/`);
    expect(out["headline"]).toBe("Тестова статия");
    expect(out["image"]).toEqual([`${ORIGIN}/media/news/2024/01/foo.jpg`]);
    expect(out["datePublished"]).toBe("2024-01-01T10:00:00.000Z");
    expect(out["dateModified"]).toBe("2024-01-02T12:00:00.000Z");
    expect(out["articleSection"]).toBe("Пловдив");
    expect(out["wordCount"]).toBe(420);
    expect(out["inLanguage"]).toBe("bg-BG");
    expect(out["mainEntityOfPage"]).toEqual({
      "@type": "WebPage",
      "@id": `${ORIGIN}/test-na-statie/`,
    });
  });

  it("clamps the headline to 110 characters", () => {
    const longTitle = "Заглавие ".repeat(40).trim();
    const out = newsArticle({
      origin: ORIGIN,
      organizationId: `${ORIGIN}/#organization`,
      path: "/x/",
      title: longTitle,
      excerpt: "",
      datePublished: "2024-01-01T10:00:00.000Z",
      dateModified: "2024-01-01T10:00:00.000Z",
      authorName: "Автор",
    });
    const headline = String(out["headline"]);
    expect(headline.length).toBeLessThanOrEqual(110);
    expect(headline.endsWith("…")).toBe(true);
  });

  it("drops the description when the excerpt is empty", () => {
    const out = newsArticle({
      origin: ORIGIN,
      organizationId: `${ORIGIN}/#organization`,
      path: "/x/",
      title: "T",
      excerpt: "",
      datePublished: "2024-01-01T10:00:00.000Z",
      dateModified: "2024-01-01T10:00:00.000Z",
      authorName: "Автор",
    });
    expect(out["description"]).toBeUndefined();
  });

  it("supports a Person URL when supplied", () => {
    const out = newsArticle({
      origin: ORIGIN,
      organizationId: `${ORIGIN}/#organization`,
      path: "/x/",
      title: "T",
      excerpt: "",
      datePublished: "2024-01-01T10:00:00.000Z",
      dateModified: "2024-01-01T10:00:00.000Z",
      authorName: "Иван",
      authorUrl: `${ORIGIN}/team/#ivan`,
    });
    const author = out["author"] as { url?: string };
    expect(author.url).toBe(`${ORIGIN}/team/#ivan`);
  });
});

describe("person", () => {
  it("links the person to the publisher via worksFor", () => {
    const out = person({
      origin: ORIGIN,
      slug: "ivan",
      name: "Иван Петров",
      bio: "Журналист в Пловдив.",
      organizationId: `${ORIGIN}/#organization`,
      publicProfile: true,
    });
    expect(out["@type"]).toBe("Person");
    expect(out["@id"]).toBe(`${ORIGIN}/team/#ivan`);
    expect(out["worksFor"]).toEqual({ "@id": `${ORIGIN}/#organization` });
    expect(out["url"]).toBe(`${ORIGIN}/team/`);
  });

  it("hides the URL when the profile is private", () => {
    const out = person({
      origin: ORIGIN,
      slug: "ivan",
      name: "Иван Петров",
      organizationId: `${ORIGIN}/#organization`,
      publicProfile: false,
    });
    expect(out["url"]).toBeUndefined();
  });
});
