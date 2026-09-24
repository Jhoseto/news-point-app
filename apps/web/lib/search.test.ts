import { describe, expect, it } from "vitest";
import { searchPageUrl, searchTerms } from "./search";

describe("searchTerms", () => {
  it("splits words and keeps Cyrillic letters and digits", () => {
    expect(searchTerms("  Пловдив   2032 ")).toEqual(["Пловдив", "2032"]);
  });

  it("drops punctuation, LIKE wildcards and too short words", () => {
    expect(searchTerms("а %_ „Марково“!")).toEqual(["Марково"]);
  });

  it("caps the number of words", () => {
    expect(searchTerms("aa bb cc dd ee ff gg hh")).toHaveLength(6);
  });

  it("returns nothing for an empty query", () => {
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("searchPageUrl", () => {
  it("encodes the query", () => {
    expect(searchPageUrl(" кмет Пловдив ")).toBe("/search/?q=%D0%BA%D0%BC%D0%B5%D1%82%20%D0%9F%D0%BB%D0%BE%D0%B2%D0%B4%D0%B8%D0%B2");
  });
});
