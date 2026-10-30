import { afterEach, describe, expect, it, vi } from "vitest";
import { CITY_CATEGORIES } from "./catalog";
import { cityHasSearchContent, cityPageGraph, cityPageMetadata, citySeoPage } from "./seo";
import { llmsText } from "../discovery";
import { serializeGraph } from "../jsonld";
import type { CityObservation } from "./local-observations";

afterEach(() => vi.unstubAllEnvs());
const report = (status: CityObservation["status"], items: CityObservation["items"] = []): CityObservation => ({ sourceId: "vik-outages", status, items, checkedAt: "2026-10-30T10:00:00Z", completeness: "complete" });
function production() { vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WEB_URL", "https://newspoint.bg"); vi.stubEnv("NP_PUBLIC_INDEXING", "1"); }

describe("city search metadata and content eligibility", () => {
  it("uses unique canonical pages and search intent, excluding personal/unknown paths", () => {
    production();
    const pages = [citySeoPage()!, ...CITY_CATEGORIES.map(category => citySeoPage(category.slug)!)];
    expect(new Set(pages.map(page => page.title)).size).toBe(pages.length);
    expect(new Set(pages.map(page => page.description)).size).toBe(pages.length);
    for (const category of CITY_CATEGORIES) {
      const metadata = cityPageMetadata(category.slug);
      expect(metadata.alternates?.canonical).toBe(`https://newspoint.bg/moyat-plovdiv/${category.slug}/`);
      expect(metadata.openGraph).toMatchObject({ url: metadata.alternates?.canonical, description: metadata.description });
    }
    for (const slug of ["saved", "out", "unknown", "../../admin", "events"]) expect(citySeoPage(slug)).toBeNull();
  });
  it("indexes useful production pages while preserving all preview and empty safeguards", () => {
    production();
    expect(cityPageMetadata("transport").robots).toMatchObject({ index: true, follow: true });
    expect(cityPageMetadata("adopt", false).robots).toMatchObject({ index: false, follow: true });
    vi.stubEnv("NODE_ENV", "development");
    expect(cityPageMetadata().robots).toMatchObject({ index: false, follow: false });
    production(); vi.stubEnv("WEB_URL", "https://preview.trycloudflare.com");
    expect(cityPageMetadata().robots).toMatchObject({ index: false });
  });
  it("distinguishes a checked empty outage report from failed or empty generic pages", () => {
    expect(cityHasSearchContent("outages", [report("observed")])).toBe(true);
    expect(cityHasSearchContent("outages", [report("stale")])).toBe(false);
    expect(cityHasSearchContent("outages", [{ ...report("observed"), completeness: "uncertain" }])).toBe(false);
    expect(cityHasSearchContent("municipality", [report("observed")])).toBe(false);
    expect(cityHasSearchContent("culture", [report("observed")])).toBe(false);
    expect(cityHasSearchContent("saved", [report("observed", [{ key: "fixture", fields: { title: "Fixture" } }])])).toBe(false);
  });
  it("uses only supplied visible entities and no fabricated freshness or rich-result claims", () => {
    production();
    const graph = cityPageGraph("culture", [{ path: "/moyat-plovdiv/events/fixture/", title: "Fixture </script>" }]);
    expect(graph.map(node => node["@type"])).toEqual(["CollectionPage", "BreadcrumbList"]);
    const serialized = serializeGraph(graph);
    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toMatch(/dateModified|lastReviewed|aggregateRating|FAQPage/);
    expect(graph[0]).toMatchObject({ spatialCoverage: { name: "Пловдив" }, publisher: { "@id": "https://newspoint.bg/#organization" } });
  });
  it("adds a truthful city section to discovery only with supplied published paths", () => {
    expect(llmsText("https://newspoint.bg", [], [])).not.toContain("## Моят Пловдив");
    const text = llmsText("https://newspoint.bg", [], [], [citySeoPage()!]);
    expect(text).toContain("https://newspoint.bg/moyat-plovdiv/");
    expect(text).toContain("не са местоположение в реално време");
    expect(text).not.toContain("/moyat-plovdiv/saved/");
  });
});
