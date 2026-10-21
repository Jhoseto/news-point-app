import { describe, expect, it } from "vitest";
import { articleDepth, createArticleMeasurement, nextArticleId, type ArticleAnalyticsEvent, type ArticleAnalyticsParams } from "./article-analytics";

const meta = { article_id: "fixture-article", article_category: "Тестова рубрика", article_author: "Тестова редакция", content_kind: "article" as const };
function fixture() {
  let allowed = false;
  const events: { event: ArticleAnalyticsEvent; params: ArticleAnalyticsParams }[] = [];
  const measurement = createArticleMeasurement(meta, () => allowed, (event, params) => { events.push({ event, params }); return true; });
  const sample = (now: number, top = -500, visible = true) => measurement.sample({ now, visible, body: { top, bottom: top + 1000, height: 1000 }, viewportHeight: 500 });
  return { events, measurement, sample, allow: (value = true) => { allowed = value; } };
}

describe("consented article measurement", () => {
  it("sends nothing before consent/runtime readiness, even after scroll and navigation", () => {
    const f = fixture();
    for (let i = 0; i < 15; i++) f.sample(i * 1000);
    f.measurement.next("fixture-next", true);
    expect(f.events).toEqual([]);
    f.allow(); f.sample(15000);
    expect(f.events.map(e => e.event)).toEqual(["np_article_view"]);
  });
  it("records context once and both body thresholds once after five foreground seconds", () => {
    const f = fixture(); f.allow();
    for (let i = 0; i <= 12; i++) f.sample(i * 1000);
    expect(f.events).toEqual([
      { event: "np_article_view", params: meta },
      { event: "np_article_depth", params: { ...meta, percent_scrolled: 50 } },
      { event: "np_article_depth", params: { ...meta, percent_scrolled: 90 } },
    ]);
  });
  it("does not treat time spent before reaching the body or in background as reading", () => {
    const f = fixture(); f.allow();
    for (let i = 0; i < 10; i++) f.sample(i * 1000, 1500);
    for (let i = 10; i < 20; i++) f.sample(i * 1000, -500, false);
    f.sample(20000);
    expect(f.events.map(e => e.event)).toEqual(["np_article_view"]);
  });
  it("does not count a suspended timer as minutes of activity", () => {
    const f = fixture(); f.allow(); f.sample(0); f.sample(120000);
    expect(f.events).toHaveLength(1);
  });
  it("uses current body progress and waits for the lower threshold before the higher", () => {
    const f = fixture(); f.allow();
    for (let i = 0; i <= 5; i++) f.sample(i * 1000, 0);
    expect(f.events.filter(e => e.event === "np_article_depth").map(e => e.params.percent_scrolled)).toEqual([50]);
    f.sample(6000, -450);
    expect(f.events.filter(e => e.event === "np_article_depth").map(e => e.params.percent_scrolled)).toEqual([50, 90]);
  });
  it("stops immediately after revocation and ignores hidden or same-article clicks", () => {
    const f = fixture(); f.allow(); f.sample(0);
    f.measurement.next(meta.article_id, true); f.measurement.next("fixture-next", false);
    f.allow(false); f.sample(1000); f.measurement.next("fixture-next", true);
    expect(f.events).toHaveLength(1);
  });
  it("records navigation once per destination without an href or query payload", () => {
    const f = fixture(); f.allow();
    f.measurement.next("fixture-next", true); f.measurement.next("fixture-next", true);
    expect(f.events).toEqual([{ event: "np_article_next", params: { ...meta, destination_article_id: "fixture-next" } }]);
  });
  it("retries an unsent observation and permits a new visit after component navigation", () => {
    let ready = false;
    const sent: string[] = [];
    const make = () => createArticleMeasurement(meta, () => true, event => { if (!ready) return false; sent.push(event); return true; });
    const sample = { now: 0, visible: true, body: null, viewportHeight: 600 };
    const first = make(); first.sample(sample); ready = true; first.sample(sample); first.sample(sample);
    make().sample(sample);
    expect(sent).toEqual(["np_article_view", "np_article_view"]);
  });
});

describe("article geometry and navigation boundary", () => {
  it("ignores missing/empty bodies and clamps geometry", () => {
    expect(articleDepth(null, 800)).toBe(0);
    expect(articleDepth({ top: 0, bottom: 0, height: 0 }, 800)).toBe(0);
    expect(articleDepth({ top: 900, bottom: 1900, height: 1000 }, 800)).toBe(0);
    expect(articleDepth({ top: -500, bottom: 500, height: 1000 }, 800)).toBe(100);
  });
  it("accepts only known same-origin article paths; excludes admin, external and same-page URLs", () => {
    const targets = new Map([["/next/", "fixture-next"]]);
    const resolve = (href: string) => nextArticleId(href, "https://newspoint.bg", "/current/", targets);
    expect(resolve("/next/?private=value#anchor")).toBe("fixture-next");
    for (const href of ["https://other.example/next/", "//other.example/next/", "/current/#anchor", "/admin/", "/plovdiv/", "mailto:x@example.org", "javascript:alert(1)"]) expect(resolve(href)).toBeNull();
  });
});
