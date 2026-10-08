import { describe, expect, it } from "vitest";
import { inspectSeoHtml } from "./html-audit";

describe("SEO HTML audit", () => {
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
