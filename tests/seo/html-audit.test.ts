import { describe, expect, it } from "vitest";
import { inspectSeoHtml } from "./html-audit";

describe("SEO HTML audit", () => {
  it("audits Article and array JSON-LD while ignoring hydration links", () => {
    const result = inspectSeoHtml('<script type="application/ld+json">[{"@type":["Article"],"headline":"Fixture","datePublished":"2026-10-20","dateModified":"2026-10-19","author":{"@type":"Person","name":""}}]</script><a href="/plovdiv/">Пловдив</a><script>"<a href=\"/fake/\">"</script>');
    expect(result.errors).toContain("Article missing description");
    expect(result.errors).toContain("Article modified before publication");
    expect(result.errors).toContain("Article invalid author identity");
    expect(result.articleHeadlines).toEqual(["Fixture"]);
    expect(result.articleAuthors).toEqual([{ "@type": "Person", name: "" }]);
    expect(result.links).toEqual(["/plovdiv/"]);
  });
  it("extracts all Article and NewsArticle authors for H1 and visible-profile comparisons", () => {
    const graph = [{ "@type": "Article", headline: "First", author: [{"@type":"Person",name:"One"},{"@type":"Person",name:"Two"}] }, { "@type": ["CreativeWork", "NewsArticle"], headline: "Second", author: {"@type":"Organization",name:"NewsPoint.bg"} }];
    const result = inspectSeoHtml(`<script type="application/ld+json">${JSON.stringify(graph)}</script>`);
    expect(result.articleHeadlines).toEqual(["First", "Second"]);
    expect(result.articleAuthors.map(author => author.name)).toEqual(["One", "Two", "NewsPoint.bg"]);
    expect(inspectSeoHtml('<script type="application/ld+json">{"@type":"Article","author":null}</script>').articleAuthors).toEqual([]);
  });
  it("reports malformed graph shapes without aborting the audit", () => {
    for (const value of ['null', '{"@graph":{}}', '[null]']) {
      expect(inspectSeoHtml(`<script type="application/ld+json">${value}</script>`).errors).toContain("Invalid JSON-LD");
    }
  });
  it("checks that public author URLs lead to visible profile anchors", () => {
    const ld = '<script type="application/ld+json">{"@type":"Person","url":"https://example.test/team/#fixture"}</script>';
    const head = '<link rel="canonical" href="https://example.test/team/"/>';
    expect(inspectSeoHtml(`${head}${ld}<section id="fixture">Fixture author</section>`).errors).toEqual([]);
    expect(inspectSeoHtml(`${head}${ld}`).errors).toContain("Person URL does not identify a visible profile");
    expect(inspectSeoHtml(`${head}<script type="application/ld+json">{"@type":"Person","url":"https://example.test/team/#%ZZ"}</script>`).errors).toContain("Invalid Person URL");
  });
  it("detects incomplete podcast metadata rather than accepting a type name alone", () => {
    const result = inspectSeoHtml('<script type="application/ld+json">{"@type":"PodcastEpisode","name":"Fixture"}</script>');
    expect(result.errors).toContain("PodcastEpisode invalid AudioObject");
    expect(result.errors).toContain("PodcastEpisode invalid datePublished");
  });
  it("keeps apostrophes inside quoted attributes and decodes numeric entities", () => {
    const result = inspectSeoHtml(`<head><link rel="canonical" href="https://example.test/fixture/"/></head><meta name="description" content="It's &#x431;&#1098;лгарски &quot;текст&quot;"/><h1>Новина <span>&amp; факт</span></h1><a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.test%2Ffixture%2F">Share</a>`);
    expect(result.descriptions).toEqual(['It\'s български "текст"']);
    expect(result.headCanonicals).toEqual(["https://example.test/fixture/"]);
    expect(result.headlines).toEqual(["Новина & факт"]);
    expect(result.shareUrls).toEqual(["https://example.test/fixture/"]);
  });
  it("ignores hydration copies and parses server-rendered metadata", () => {
    const result = inspectSeoHtml('<title>Тема &amp; новини</title><link rel="canonical" href="https://example.test/temi/topic/"/><meta name="description" content="Хронология"/><script>self.push(\'<title>Duplicate</title>\')</script>');
    expect(result.titles).toEqual(["Тема & новини"]);
    expect(result.canonicals).toEqual(["https://example.test/temi/topic/"]);
  });
  it("detects invalid structured data", () => {
    const result = inspectSeoHtml('<script type="application/ld+json">{"@type":"NewsArticle","headline":"Fixture"}</script><script type="application/ld+json">broken</script>');
    expect(result.errors).toContain("Invalid JSON-LD");
    expect(result.errors).toContain("NewsArticle invalid dateModified");
  });
});
