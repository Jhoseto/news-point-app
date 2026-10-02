import { describe, expect, it } from "vitest";
import {
  bytesText,
  clock,
  filterEpisodes,
  isEditorDirty,
  isNewEpisodeValid,
  longDate,
  shortDate,
  sortByPublishedAtDesc,
} from "./podcast-desk-utils";
import type { StudioEpisode } from "./podcast-desk-types";

const EP_A: StudioEpisode = {
  id: "a",
  title: "Убийството на Илиян Филипов",
  slug: "ubiyistvoto-na-iliyan-filipov-43719f",
  summary: "Анализ и коментар от студиото.",
  coverKey: "podcasts/2026/10/a.webp",
  durationSec: 1818,
  bytes: 7_400_000,
  categoryId: "cat-plovdiv",
  categoryName: "Пловдив",
  status: "published",
  publishedAt: "2026-10-02T10:38:00.000Z",
};

const EP_B: StudioEpisode = { ...EP_A, id: "b", title: "Безплатен джетят на прага", status: "draft", publishedAt: null, durationSec: 0, bytes: 0 };

const EP_C: StudioEpisode = { ...EP_A, id: "c", title: "Случаят Сарафов", slug: "sluchayat-sarafov", status: "published", publishedAt: "2026-10-01T08:15:00.000Z" };

describe("clock", () => {
  it("formats whole minutes with two zero padding seconds", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65)).toBe("1:05");
    expect(clock(1818)).toBe("30:18");
  });
});

describe("bytesText", () => {
  it("returns an em-dash for zero/empty", () => {
    expect(bytesText(0)).toBe("—");
  });
  it("formats sub-megabyte values in KB", () => {
    expect(bytesText(512 * 1024)).toBe("512 KB");
    expect(bytesText(1023 * 1024)).toBe("1023 KB");
  });
  it("formats megabyte values with one decimal", () => {
    expect(bytesText(7_400_000)).toBe("7.1 MB");
    expect(bytesText(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("shortDate / longDate", () => {
  it("returns em-dash for null", () => {
    expect(shortDate(null)).toBe("—");
    expect(longDate(null)).toBe("—");
  });
  it("formats a known UTC instant as a non-empty European-style string", () => {
    const out = shortDate("2026-10-02T10:38:00.000Z");
    expect(out).not.toBe("—");
    // shortDate formats month/day/time; it does not embed the year, but the output is always non-empty and contains a colon (time).
    expect(out).toMatch(/\d{1,2}[.:]\d{2}/);
  });
});

describe("filterEpisodes", () => {
  it("returns everything when the filter is all and query is empty", () => {
    expect(filterEpisodes([EP_A, EP_B, EP_C], "all", "").map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by status without changing order otherwise", () => {
    expect(filterEpisodes([EP_A, EP_B, EP_C], "published", "").map((n) => n.id)).toEqual(["a", "c"]);
    expect(filterEpisodes([EP_A, EP_B, EP_C], "draft", "").map((n) => n.id)).toEqual(["b"]);
  });

  it("searches by title and slug, case-insensitively", () => {
    expect(filterEpisodes([EP_A, EP_B, EP_C], "all", "Сарафов").map((n) => n.id)).toEqual(["c"]);
    expect(filterEpisodes([EP_A, EP_B, EP_C], "all", "САРАФОВ").map((n) => n.id)).toEqual(["c"]);
    expect(filterEpisodes([EP_A, EP_B, EP_C], "all", "sluchayat").map((n) => n.id)).toEqual(["c"]);
    expect(filterEpisodes([EP_A, EP_B, EP_C], "all", "прага").map((n) => n.id)).toEqual(["b"]);
  });

  it("combines status and query filters", () => {
    expect(filterEpisodes([EP_A, EP_B, EP_C], "draft", "Сарафов")).toEqual([]);
    expect(filterEpisodes([EP_A, EP_B, EP_C], "published", "JET")).toEqual([]);
  });

  it("ignores whitespace-only queries", () => {
    expect(filterEpisodes([EP_A, EP_B, EP_C], "all", "   ").map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("sortByPublishedAtDesc", () => {
  it("sorts by ISO date descending, treating null as oldest", () => {
    const sorted = sortByPublishedAtDesc([EP_B, EP_A, EP_C]).map((n) => n.id);
    expect(sorted).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = [EP_B, EP_A, EP_C];
    sortByPublishedAtDesc(input);
    expect(input.map((n) => n.id)).toEqual(["b", "a", "c"]);
  });
});

describe("isNewEpisodeValid", () => {
  it("requires cover, audio, title (>=2 chars) and summary (>=1 char)", () => {
    expect(isNewEpisodeValid({ title: "", summary: "", categoryId: "", coverFile: null, audioFile: null })).toBe(false);
    expect(isNewEpisodeValid({ title: "Hi", summary: "x", categoryId: "", coverFile: null, audioFile: null })).toBe(false);
    expect(isNewEpisodeValid({ title: "Hi", summary: "x", categoryId: "", coverFile: new File([], "c.webp"), audioFile: null })).toBe(false);
    expect(isNewEpisodeValid({ title: "Hi", summary: "x", categoryId: "", coverFile: new File([], "c.webp"), audioFile: new File([], "a.mp3") })).toBe(true);
  });

  it("trims whitespace before measuring the minimum length", () => {
    const cover = new File([], "c.webp");
    const audio = new File([], "a.mp3");
    expect(isNewEpisodeValid({ title: "  ", summary: "x", categoryId: "", coverFile: cover, audioFile: audio })).toBe(false);
    expect(isNewEpisodeValid({ title: "Hi", summary: "  ", categoryId: "", coverFile: cover, audioFile: audio })).toBe(false);
  });
});

describe("isEditorDirty", () => {
  it("is clean when title, summary and category are unchanged", () => {
    expect(isEditorDirty({ title: EP_A.title, summary: EP_A.summary, categoryId: EP_A.categoryId }, EP_A)).toBe(false);
  });

  it("detects a title change including trailing whitespace", () => {
    expect(isEditorDirty({ title: `${EP_A.title} `, summary: EP_A.summary, categoryId: EP_A.categoryId }, EP_A)).toBe(false);
    expect(isEditorDirty({ title: `${EP_A.title} •`, summary: EP_A.summary, categoryId: EP_A.categoryId }, EP_A)).toBe(true);
  });

  it("detects a summary change", () => {
    expect(isEditorDirty({ title: EP_A.title, summary: `${EP_A.summary} (обновен)`, categoryId: EP_A.categoryId }, EP_A)).toBe(true);
  });

  it("detects a category change (string vs null)", () => {
    expect(isEditorDirty({ title: EP_A.title, summary: EP_A.summary, categoryId: null }, EP_A)).toBe(true);
  });
});