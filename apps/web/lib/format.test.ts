import { describe, expect, it } from "vitest";
import { formatCardTime, formatClock, formatShort, isRecentArticle, readingMinutes } from "./format";

// 2026-09-24 07:40 in Sofia (UTC+3).
const now = new Date("2026-09-24T04:40:00Z");

describe("formatShort", () => {
  it("shows the Sofia time for today", () => {
    expect(formatShort(new Date("2026-09-24T04:40:00Z"), now)).toBe("07:40");
  });

  it("uses the Sofia date near midnight UTC", () => {
    // 23 Sep 22:30 UTC is already 24 Sep 01:30 in Sofia.
    expect(formatShort(new Date("2026-09-23T22:30:00Z"), now)).toBe("01:30");
  });

  it("shows day and month for earlier days", () => {
    expect(formatShort(new Date("2026-09-23T19:45:00Z"), now)).toBe("23 септември");
  });
});

describe("formatClock", () => {
  it("shows a numeric date for earlier days", () => {
    expect(formatClock(new Date("2026-09-23T19:45:00Z"), now)).toBe("23.09");
  });
});

describe("formatCardTime", () => {
  it("shows minutes for articles younger than one hour", () => {
    expect(formatCardTime(new Date("2026-09-24T04:18:00Z"), now)).toBe("преди 22 минути");
  });

  it("shows hours for articles younger than 24 hours", () => {
    expect(formatCardTime(new Date("2026-09-23T23:40:00Z"), now)).toBe("преди 5 часа");
  });

  it("uses the regular date after 24 hours", () => {
    expect(formatCardTime(new Date("2026-09-23T04:39:00Z"), now)).toBe("23 септември");
  });
});

describe("isRecentArticle", () => {
  it("marks only the first hour after publication as new", () => {
    expect(isRecentArticle(new Date("2026-09-24T03:41:00Z"), now)).toBe(true);
    expect(isRecentArticle(new Date("2026-09-24T03:40:00Z"), now)).toBe(false);
    expect(isRecentArticle(new Date("2026-09-24T04:41:00Z"), now)).toBe(false);
  });
});

describe("readingMinutes", () => {
  it("counts words from text blocks and ignores markup", () => {
    const words = Array.from({ length: 400 }, () => "дума").join(" ");
    expect(
      readingMinutes([
        { type: "paragraph", html: `<strong>${words}</strong>` },
        { type: "heading", level: 2, text: "Заглавие" },
      ]),
    ).toBe(2);
  });

  it("never reports zero minutes", () => {
    expect(readingMinutes([])).toBe(1);
  });
});
