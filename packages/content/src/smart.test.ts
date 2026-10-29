import { describe, expect, it } from "vitest";
import { AI_RATES, aiCostUsd, normalizeSmartQuestion, safeCsvCell, validateSmartEvidence } from "./smart";

describe("Smart accounting and evidence", () => {
  it("prices cached input and reasoning subsets exactly once", () => {
    expect(aiCostUsd({ input: 8000, cachedInput: 0, cacheWrite: 0, output: 2000, reasoning: 1500, searches: 1 }, AI_RATES["gpt-6.1-sol"]!)).toBe("0.046000000000");
    expect(aiCostUsd({ input: 1000, cachedInput: 500, cacheWrite: 100, output: 100, reasoning: 80, searches: 0 }, AI_RATES["gpt-6.1-sol"]!)).toBe("0.002100000000");
  });
  it("rejects unknown usage instead of reporting zero", () => {
    expect(() => aiCostUsd({ input: 10, cachedInput: 20, cacheWrite: 0, output: 1, reasoning: 0, searches: 0 }, AI_RATES["gpt-6.1-sol"]!)).toThrow();
  });
  it("does not let CSV titles execute formulas", () => {
    expect(safeCsvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"');
    expect(normalizeSmartQuestion(" Какво  СЛЕДВА? ")).toBe("какво следва");
  });
  it("rejects factual answers without supplied evidence", () => {
    expect(() => validateSmartEvidence({ status: "answered", blocks: [{ text: "Test fixture fact", sourceIds: ["invented"] }], sources: [], followUps: [], checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10000).toISOString() })).toThrow("unknown_evidence");
  });
});
