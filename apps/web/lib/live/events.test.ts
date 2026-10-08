import { describe, expect, it } from "vitest";
import { affectedPaths, formatSse, parseLastEventId, toLiveCard, toLiveEvent } from "./events";

const row = {
  id: 42,
  type: "article.published" as const,
  entityId: "0b7c2a44-4f0e-4a61-9d61-2d1f0c6d3a10",
  version: 1,
  payload: { path: "/nova-statiya/", title: "Нова статия", topics: ["plovdiv"] },
  occurredAt: new Date("2026-09-24T06:00:00Z"),
};

describe("toLiveEvent", () => {
  it("exposes exactly the public contract fields", () => {
    expect(Object.keys(toLiveEvent(row)).sort()).toEqual(
      ["card", "entityId", "eventId", "layoutVersion", "occurredAt", "path", "title", "topics", "type", "version"].sort(),
    );
  });

  it("keeps only the public card fields", () => {
    const card = toLiveCard({
      category: { id: "c1", slug: "plovdiv", name: "Пловдив", path: "/plovdiv/" },
      hero: { url: "https://newspoint.bg/a.jpg", alt: "Снимка", width: 800, height: 600, caption: "вътрешен текст" },
      publishedAt: new Date("2026-09-24T06:00:00Z"),
    } as Parameters<typeof toLiveCard>[0]);
    expect(card).toEqual({
      category: { name: "Пловдив", path: "/plovdiv/" },
      image: { url: "https://newspoint.bg/a.jpg", alt: "Снимка" },
      publishedAt: "2026-09-24T06:00:00.000Z",
    });
  });

  it("drops fields that are not part of the public payload", () => {
    const leaky = { ...row, payload: { ...row.payload, sourceHtml: "<p>draft</p>" } };
    expect(JSON.stringify(toLiveEvent(leaky))).not.toContain("draft");
  });
});

describe("formatSse", () => {
  it("writes id, event name and one data line", () => {
    const text = formatSse(toLiveEvent(row));
    expect(text.startsWith("id: 42\nevent: article\ndata: {")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(true);
    expect(text.split("\n").filter((line) => line.startsWith("data:"))).toHaveLength(1);
  });
});

describe("parseLastEventId", () => {
  it("accepts positive integers", () => {
    expect(parseLastEventId("17")).toBe(17);
    expect(parseLastEventId(" 17 ")).toBe(17);
  });

  it("rejects anything else", () => {
    for (const value of [null, "", "0", "-1", "1.5", "abc", "1e3", "9".repeat(20), "1; drop table"]) {
      expect(parseLastEventId(value)).toBeNull();
    }
  });
});

describe("affectedPaths", () => {
  it("always includes the homepage and the article", () => {
    expect(affectedPaths({ path: "/nova-statiya/" })).toEqual(["/", "/nova-statiya/", "/feed/", "/sitemap.xml", "/llms.txt"]);
  });
  it("includes rubric paths from topics so a category move clears both listings", () => {
    expect(affectedPaths({ path: "/nova-statiya/", topics: ["plovdiv", "tehnologii"] })).toEqual([
      "/",
      "/nova-statiya/",
      "/plovdiv/",
      "/tehnologii/",
      "/feed/",
      "/sitemap.xml",
      "/llms.txt",
    ]);
  });
  it("ignores malformed topics", () => {
    expect(affectedPaths({ path: "/nova-statiya/", topics: ["../evil", "OK", "tehnologii"] })).toEqual([
      "/",
      "/nova-statiya/",
      "/tehnologii/",
      "/feed/",
      "/sitemap.xml",
      "/llms.txt",
    ]);
  });
  it("refreshes the sitemap after theme publication without treating it as an article", () => {
    expect(affectedPaths({ path: "/temi/example/", type: "story.updated" })).toEqual(["/temi", "/temi/example/", "/sitemap.xml", "/llms.txt"]);
    expect(affectedPaths({ path: "/plovdiv/", type: "layout.updated" })).toEqual(["/plovdiv/"]);
  });
});
