import { describe, expect, it } from "vitest";
import { addRecentSearch, readRecentSearches, RECENT_SEARCH_LIMIT, RECENT_SEARCH_TTL } from "./recent-searches";

const now = 1_800_000_000_000;
const storage = (value: unknown) => ({ getItem: () => JSON.stringify(value) });
describe("recent searches on this device", () => {
  it("bounds history, normalizes input and moves duplicates to the front", () => {
    const items = Array.from({ length: 12 }, (_, n) => ({ query: `Новина ${n}`, at: now }));
    const parsed = readRecentSearches(storage(items), now);
    expect(parsed).toHaveLength(RECENT_SEARCH_LIMIT);
    const next = addRecentSearch(parsed, "  новина  3 ", now + 1);
    expect(next[0]).toEqual({ query: "новина 3", at: now + 1 });
    expect(next.filter(item => item.query.toLowerCase() === "новина 3")).toHaveLength(1);
    expect(next).toHaveLength(RECENT_SEARCH_LIMIT);
  });
  it("rejects malformed, oversized, stale, future and non-searchable entries", () => {
    expect(readRecentSearches({ getItem: () => "invalid" }, now)).toEqual([]);
    expect(readRecentSearches({ getItem: () => "a".repeat(4097) }, now)).toEqual([]);
    expect(readRecentSearches(storage([{ query: "старо", at: now - RECENT_SEARCH_TTL - 1 }, { query: "бъдеще", at: now + 60_001 }, { query: "%_", at: now }, null, { query: "а".repeat(81), at: now }]), now)).toEqual([]);
    expect(addRecentSearch([], "%_", now)).toEqual([]);
  });
  it("deduplicates storage without trusting its schema", () => {
    expect(readRecentSearches(storage([{ query: "Пловдив", at: now }, { query: "пловдив", at: now }, { query: 17, at: now }]), now)).toEqual([{ query: "Пловдив", at: now }]);
  });
  it("lets the UI handle a blocked storage error", () => {
    expect(() => readRecentSearches({ getItem: () => { throw new Error("blocked"); } }, now)).toThrow("blocked");
  });
});
