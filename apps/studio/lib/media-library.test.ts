import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const execute = vi.hoisted(() => vi.fn());

vi.mock("@newspoint/db", () => ({
  getDb: () => ({ execute }),
  mediaAssets: {},
}));

import { libraryImageUrl, listMediaArchive, listMediaFolder, mediaFolder, normalizeMediaName, searchMediaLibrary } from "./media-library";

it("allows only news year and month folders", () => {
  expect(mediaFolder("news/2026")).toBe("news/2026");
  expect(mediaFolder("news/2026/09")).toBe("news/2026/09");
  expect(mediaFolder("/news/2026/09/")).toBe("news/2026/09");
  expect(mediaFolder("news/2026/13")).toBeNull();
  expect(mediaFolder("news/../etc")).toBeNull();
  expect(mediaFolder("users/profiles")).toBeNull();
});

it("points library photos at the public site, not at Studio", () => {
  expect(libraryImageUrl("news/2026/09/zholej.webp", null)).toBe("/media/news/2026/09/zholej.webp");
});

it("searchMediaLibrary rejects short queries and invalid folders without hitting the DB", async () => {
  expect(await searchMediaLibrary("")).toEqual({ items: [], total: 0 });
  expect(await searchMediaLibrary("a")).toEqual({ items: [], total: 0 });
  expect(await searchMediaLibrary("ab", { folder: "users/profiles" })).toEqual({ items: [], total: 0 });
  expect(await searchMediaLibrary("ab", { folder: "news/2026" })).toEqual({ items: [], total: 0 });
});

function queryText(query: unknown): string {
  return JSON.stringify(query);
}

it("opens the archive and a month folder with the newest upload first", async () => {
  execute.mockReset();
  execute.mockImplementation(async (query: unknown) => {
    const text = queryText(query);
    if (text.includes("count(*)")) return [{ total: 2 }];
    return [
      { id: "new", storage_key: "news/2026/10/new.webp", alt: "Нова", source_url: null },
      { id: "old", storage_key: "news/2026/10/old.webp", alt: "Стара", source_url: null },
    ];
  });
  const archive = await listMediaArchive(0, 80);
  const folder = await listMediaFolder("news/2026/10", 0, 80);
  const found = await searchMediaLibrary("пловдив", { offset: 0, limit: 80 });
  expect(archive.items.map((item) => item.id)).toEqual(["new", "old"]);
  expect(folder.total).toBe(2);
  expect(found.total).toBe(2);
  const listed = execute.mock.calls.map(([query]) => queryText(query)).filter((text) => text.includes("limit"));
  expect(listed).toHaveLength(3);
  for (const text of listed) {
    expect(text).toContain("created_at desc, id desc");
    expect(text).not.toContain("order by storage_key desc");
  }
});

it("normalizes searchable media names", () => {
  expect(normalizeMediaName("  Пловдив площад  ")).toBe("Пловдив площад");
  expect(normalizeMediaName("")).toBe("");
  expect(normalizeMediaName("x".repeat(300)).length).toBe(240);
});
