import { describe, expect, it } from "vitest";
import {
  countByStatus,
  filterSubmissions,
  KIND_LABELS,
  LABELS,
  snippet,
  statusTone,
  type Submission,
} from "./submissions-manager-utils";

const BASE: Submission = {
  id: "1",
  kind: "report",
  status: "received",
  payload: { description: "Снощи в 23:15 чух силен шум откъм паркинга на ул. Хан Крум." },
  contact: "georgi@example.com",
  createdAt: "2026-10-02T07:00:00.000Z",
  articleId: null,
};

const PUBLISHED: Submission = { ...BASE, id: "2", status: "published", payload: { description: "Потвърдена публикация." }, contact: null };
const VERIFIED: Submission = { ...BASE, id: "3", status: "verified" };
const REJECTED: Submission = { ...BASE, id: "4", status: "rejected" };
const MY_NEWS: Submission = { ...BASE, id: "5", kind: "my_news", status: "received", payload: { workingTitle: "Работно заглавие", whereWhen: "Пловдив, 2026-09-30" } };

describe("LABELS / KIND_LABELS", () => {
  it("labels every known status in Bulgarian", () => {
    expect(LABELS.received).toBe("Получен");
    expect(LABELS.in_review).toBe("В проверка");
    expect(LABELS.verified).toBe("Потвърден");
    expect(LABELS.rejected).toBe("Отхвърлен");
    expect(LABELS.published).toBe("Публикуван");
  });
  it("labels every known kind in Bulgarian", () => {
    expect(KIND_LABELS.report).toBe("Сигнал");
    expect(KIND_LABELS.my_news).toBe("Моята новина");
  });
});

describe("statusTone", () => {
  it("maps positive states to the positive tone", () => {
    expect(statusTone("verified")).toBe("positive");
    expect(statusTone("published")).toBe("positive");
  });
  it("maps the rejected state to the negative tone", () => {
    expect(statusTone("rejected")).toBe("negative");
  });
  it("maps the in-flight states to the info tone", () => {
    expect(statusTone("received")).toBe("info");
    expect(statusTone("in_review")).toBe("info");
  });
  it("falls back to neutral for unknown values", () => {
    expect(statusTone("archived")).toBe("neutral");
    expect(statusTone("")).toBe("neutral");
  });
});

describe("snippet", () => {
  it("prefers description, then whatHappened, then workingTitle", () => {
    expect(snippet({ description: "A" })).toBe("A");
    expect(snippet({ whatHappened: "B" })).toBe("B");
    expect(snippet({ workingTitle: "C" })).toBe("C");
  });
  it("returns an em-dash when nothing matches", () => {
    expect(snippet({})).toBe("—");
  });
  it("truncates at 180 characters", () => {
    const long = "x".repeat(220);
    expect(snippet({ description: long }).length).toBe(180);
  });
});

describe("filterSubmissions", () => {
  it("returns everything when both filters are 'all' and the query is empty", () => {
    expect(filterSubmissions([BASE, PUBLISHED, VERIFIED, REJECTED, MY_NEWS], "all", "all", "").map((n) => n.id))
      .toEqual(["1", "2", "3", "4", "5"]);
  });

  it("filters by status", () => {
    expect(filterSubmissions([BASE, PUBLISHED, VERIFIED, REJECTED, MY_NEWS], "verified", "all", "").map((n) => n.id)).toEqual(["3"]);
    expect(filterSubmissions([BASE, PUBLISHED, VERIFIED, REJECTED, MY_NEWS], "rejected", "all", "").map((n) => n.id)).toEqual(["4"]);
  });

  it("filters by kind", () => {
    expect(filterSubmissions([BASE, MY_NEWS], "all", "report", "").map((n) => n.id)).toEqual(["1"]);
    expect(filterSubmissions([BASE, MY_NEWS], "all", "my_news", "").map((n) => n.id)).toEqual(["5"]);
  });

  it("searches payload (case-insensitive)", () => {
    expect(filterSubmissions([BASE, MY_NEWS], "all", "all", "Работно").map((n) => n.id)).toEqual(["5"]);
    expect(filterSubmissions([BASE, MY_NEWS], "all", "all", "РАБОТНО").map((n) => n.id)).toEqual(["5"]);
  });

  it("searches contact (case-insensitive)", () => {
    expect(filterSubmissions([BASE, PUBLISHED], "all", "all", "georgi@").map((n) => n.id)).toEqual(["1"]);
    expect(filterSubmissions([BASE, PUBLISHED], "all", "all", "GEORGI@").map((n) => n.id)).toEqual(["1"]);
  });

  it("ignores whitespace-only queries", () => {
    expect(filterSubmissions([BASE], "all", "all", "   ").map((n) => n.id)).toEqual(["1"]);
  });
});

describe("countByStatus", () => {
  it("counts every status, plus the totals", () => {
    const counts = countByStatus([BASE, BASE, PUBLISHED, VERIFIED, REJECTED, MY_NEWS]);
    expect(counts.all).toBe(6);
    expect(counts.received).toBe(3);
    expect(counts.published).toBe(1);
    expect(counts.verified).toBe(1);
    expect(counts.rejected).toBe(1);
    expect(counts.reports).toBe(5);
    expect(counts.my_news).toBe(1);
  });

  it("returns zeros for an empty list", () => {
    const counts = countByStatus([]);
    expect(counts.all).toBe(0);
    expect(counts.received).toBe(0);
    expect(counts.reports).toBe(0);
    expect(counts.my_news).toBe(0);
  });
});