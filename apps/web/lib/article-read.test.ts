import { describe, expect, it } from "vitest";
import { isEngagedArticleRead } from "./article-read";

describe("isEngagedArticleRead", () => {
  it("requires both time and meaningful article progress", () => {
    expect(isEngagedArticleRead(7_999, 0.8)).toBe(false);
    expect(isEngagedArticleRead(12_000, 0.34)).toBe(false);
    expect(isEngagedArticleRead(8_000, 0.35)).toBe(true);
  });
});
