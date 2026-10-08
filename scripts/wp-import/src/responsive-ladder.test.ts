import { describe, expect, it } from "vitest";
import {
  cardKeyForMaster,
  neededWidths,
  presentationsWithoutRedundantCard,
  variantKeyForWidth,
} from "./responsive-ladder";

describe("responsive ladder helpers", () => {
  it("lists widths under the source", () => {
    expect(neededWidths(2400)).toEqual([320, 480, 768, 1024, 1440, 1920]);
    expect(neededWidths(900)).toEqual([320, 480, 768]);
  });

  it("builds sibling keys from the master", () => {
    expect(variantKeyForWidth("news/2026/10/a.webp", 768)).toBe("news/2026/10/a-w768.webp");
    expect(cardKeyForMaster("news/2026/10/a.webp")).toBe("news/2026/10/a-card.webp");
  });

  it("drops redundant card entries when a ladder exists", () => {
    const cleaned = presentationsWithoutRedundantCard([
      { url: "/media/news/2026/10/a-card.webp", width: 960, height: 540 },
      { url: "/media/news/2026/10/a-w768.webp", width: 768, height: 432 },
      { url: "/media/news/2026/10/a-w1440.webp", width: 1440, height: 810 },
    ]);
    expect(cleaned.every((entry) => !entry.url.includes("-card.webp"))).toBe(true);
    expect(cleaned).toHaveLength(2);
  });
});
