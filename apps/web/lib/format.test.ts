import { describe, expect, it } from "vitest";
import { formatClock, formatShort, readingMinutes } from "./format";

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
