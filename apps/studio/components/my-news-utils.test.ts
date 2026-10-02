import { describe, expect, it } from "vitest";
import {
  countByStatus,
  filterMyNews,
  formatDate,
  formatDateLong,
  isEditorialUpdateValid,
  MY_NEWS_STATUSES,
  nextAllowedStatuses,
  normalizeSubmission,
  parsePayload,
  photoUrl,
  snippet,
  sortByDate,
  STATUS_LABELS,
  statusTone,
  type MyNewsSubmission,
} from "./my-news-utils";

const RAW_RECEIVED = {
  id: "1",
  status: "received",
  payload: {
    workingTitle: "Улично осветление в спуска",
    whatHappened: "Тъмна зона от 2 седмици.",
    whereWhen: "Пловдив, 13.10.2026, 22:30",
    publishName: "Илия Георгиев",
    rightsAck: true,
    factsAck: true,
    files: [{ path: "livepoint/abc.webp" }, { path: "livepoint/def.webp" }],
    position: { lat: 42.15, lon: 24.75 },
  },
  contact: "il@example.com",
  createdAt: "2026-10-13T20:00:00.000Z",
  articleId: null,
};

const RAW_PUBLISHED = { ...RAW_RECEIVED, id: "2", status: "published", articleId: "11111111-1111-1111-1111-111111111111" };

function build(overrides: Partial<MyNewsSubmission> = {}): MyNewsSubmission {
  return normalizeSubmission({ ...RAW_RECEIVED, ...overrides });
}

describe("parsePayload", () => {
  it("extracts every well-known field with safe defaults", () => {
    expect(parsePayload(RAW_RECEIVED.payload)).toEqual({
      workingTitle: "Улично осветление в спуска",
      whatHappened: "Тъмна зона от 2 седмици.",
      whereWhen: "Пловдив, 13.10.2026, 22:30",
      publishName: "Илия Георгиев",
      rightsAck: true,
      factsAck: true,
    });
  });

  it("falls back to description when whatHappened is missing", () => {
    const parsed = parsePayload({ description: "Описание без whatHappened" });
    expect(parsed.whatHappened).toBe("Описание без whatHappened");
  });

  it("returns empty strings for missing fields instead of crashing", () => {
    expect(parsePayload({})).toEqual({
      workingTitle: "",
      whatHappened: "",
      whereWhen: "",
      publishName: "",
      rightsAck: false,
      factsAck: false,
    });
  });
});

describe("normalizeSubmission", () => {
  it("extracts photos from the payload.files array", () => {
    const normalized = build();
    expect(normalized.photos).toEqual([{ path: "livepoint/abc.webp" }, { path: "livepoint/def.webp" }]);
  });

  it("parses the position object when present", () => {
    expect(build().position).toEqual({ lat: 42.15, lon: 24.75 });
  });

  it("returns null for an invalid position", () => {
    expect(build({ payload: { ...RAW_RECEIVED.payload, position: { lat: "x", lon: null } } }).position).toBeNull();
  });

  it("ignores non-array files gracefully", () => {
    expect(build({ payload: { ...RAW_RECEIVED.payload, files: "oops" } }).photos).toEqual([]);
  });
});

describe("statusTone / STATUS_LABELS", () => {
  it("labels every status in Bulgarian", () => {
    expect(STATUS_LABELS.received).toBe("Получен");
    expect(STATUS_LABELS.in_review).toBe("В проверка");
    expect(STATUS_LABELS.verified).toBe("Потвърден");
    expect(STATUS_LABELS.rejected).toBe("Отхвърлен");
    expect(STATUS_LABELS.published).toBe("Публикуван");
  });
  it("maps positive states to a positive tone", () => {
    expect(statusTone("verified")).toBe("positive");
    expect(statusTone("published")).toBe("positive");
  });
  it("maps in_review to info", () => {
    expect(statusTone("in_review")).toBe("info");
  });
  it("maps rejected to negative", () => {
    expect(statusTone("rejected")).toBe("negative");
  });
  it("falls back to neutral for unknown values", () => {
    expect(statusTone("archived")).toBe("neutral");
  });
});

describe("formatDate / formatDateLong", () => {
  it("formats a known UTC instant", () => {
    expect(formatDate("2026-10-13T20:00:00.000Z")).toMatch(/\d/);
    expect(formatDateLong("2026-10-13T20:00:00.000Z")).toMatch(/\d/);
  });
});

describe("snippet", () => {
  it("prefers workingTitle then whatHappened then description", () => {
    expect(snippet({ workingTitle: "T" })).toBe("T");
    expect(snippet({ whatHappened: "W" })).toBe("W");
    expect(snippet({ description: "D" })).toBe("D");
  });
  it("truncates at 180 characters", () => {
    expect(snippet({ workingTitle: "x".repeat(220) }).length).toBe(180);
  });
});

describe("filterMyNews", () => {
  const items = [
    build({ id: "1", status: "received" }),
    build({ id: "2", status: "in_review" }),
    build({ id: "3", status: "verified" }),
    build({ id: "4", status: "published", articleId: "11111111-1111-1111-1111-111111111111" }),
    build({ id: "5", status: "rejected" }),
  ];

  it("returns everything when the filter is 'all' and the query is empty", () => {
    expect(filterMyNews(items, "all", "").map((n) => n.id)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("filters by status", () => {
    expect(filterMyNews(items, "verified", "").map((n) => n.id)).toEqual(["3"]);
    expect(filterMyNews(items, "published", "").map((n) => n.id)).toEqual(["4"]);
    expect(filterMyNews(items, "rejected", "").map((n) => n.id)).toEqual(["5"]);
  });

it("searches workingTitle, whatHappened, whereWhen, publishName and contact (case-insensitive)", () => {
    expect(filterMyNews(items, "all", "Осветление").map((n) => n.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(filterMyNews(items, "all", "Тъмна зона").map((n) => n.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(filterMyNews(items, "all", "Пловдив").map((n) => n.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(filterMyNews(items, "all", "Илия").map((n) => n.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(filterMyNews(items, "all", "IL@EXAMPLE").map((n) => n.id)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("ignores whitespace-only queries", () => {
    expect(filterMyNews(items, "all", "   ").map((n) => n.id)).toEqual(["1", "2", "3", "4", "5"]);
  });
});

describe("sortByDate", () => {
  it("sorts by ISO date descending", () => {
    const sorted = sortByDate([
      build({ id: "1", createdAt: "2026-10-01T00:00:00.000Z" }),
      build({ id: "2", createdAt: "2026-10-13T20:00:00.000Z" }),
      build({ id: "3", createdAt: "2026-10-05T00:00:00.000Z" }),
    ]).map((n) => n.id);
    expect(sorted).toEqual(["2", "3", "1"]);
  });
});

describe("countByStatus", () => {
  it("counts every status plus the totals", () => {
    const counts = countByStatus([
      build({ id: "1", status: "received" }),
      build({ id: "2", status: "received" }),
      build({ id: "3", status: "in_review" }),
      build({ id: "4", status: "verified" }),
      build({ id: "5", status: "published", articleId: "11111111-1111-1111-1111-111111111111", payload: { ...RAW_RECEIVED.payload, files: [{ path: "x.webp" }] } }),
      build({ id: "6", status: "rejected" }),
    ]);
    expect(counts.all).toBe(6);
    expect(counts.received).toBe(2);
    expect(counts.in_review).toBe(1);
    expect(counts.verified).toBe(1);
    expect(counts.published).toBe(1);
    expect(counts.rejected).toBe(1);
    expect(counts.withPhotos).toBe(6);
    expect(counts.linkedToArticle).toBe(1);
  });

  it("returns zeros for an empty list", () => {
    const counts = countByStatus([]);
    expect(counts.all).toBe(0);
    expect(counts.withPhotos).toBe(0);
    expect(counts.linkedToArticle).toBe(0);
  });
});

describe("nextAllowedStatuses", () => {
  it("received can move to in_review, verified, or rejected", () => {
    expect(nextAllowedStatuses("received")).toEqual(["in_review", "verified", "rejected"]);
  });
  it("published can only go back to verified", () => {
    expect(nextAllowedStatuses("published")).toEqual(["verified"]);
  });
  it("rejected can be re-opened to received", () => {
    expect(nextAllowedStatuses("rejected")).toEqual(["received"]);
  });
  it("returns an empty array for unknown statuses", () => {
    expect(nextAllowedStatuses("archived")).toEqual([]);
  });
});

describe("isEditorialUpdateValid", () => {
  it("accepts a known status without an articleId", () => {
    expect(isEditorialUpdateValid({ status: "received" })).toBe(true);
  });

  it("accepts a known status with a uuid articleId", () => {
    expect(isEditorialUpdateValid({ status: "published", articleId: "11111111-1111-1111-1111-111111111111" })).toBe(true);
  });

  it("accepts null articleId (clearing the link)", () => {
    expect(isEditorialUpdateValid({ status: "verified", articleId: null })).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(isEditorialUpdateValid({ status: "archived" })).toBe(false);
  });

  it("rejects a malformed articleId", () => {
    expect(isEditorialUpdateValid({ status: "verified", articleId: "not-a-uuid" })).toBe(false);
  });
});

describe("photoUrl", () => {
  it("URL-encodes the path", () => {
    expect(photoUrl("livepoint/abc def.webp")).toContain("livepoint%2Fabc%20def.webp");
  });
  it("uses the editor API endpoint", () => {
    expect(photoUrl("x.webp")).toMatch(/^\/api\/editor\/submissions\/photo\/\?path=/);
  });
});

describe("MY_NEWS_STATUSES", () => {
  it("contains the five statuses the API accepts", () => {
    expect(MY_NEWS_STATUSES).toEqual(["received", "in_review", "verified", "rejected", "published"]);
  });
});

describe("RAW_PUBLISHED sanity", () => {
  it("is also published", () => {
    expect(RAW_PUBLISHED.status).toBe("published");
  });
});