import { describe, expect, it } from "vitest";
import { AI_RATES, aiCostUsd, normalizeSmartQuestion, smartEvidenceContains, smartReaderText, readerSmartSession, safeCsvCell, validateSmartEvidence } from "./smart";

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

it("matches layout whitespace in quotes but never changes dates, words or punctuation",()=>{
 expect(smartEvidenceContains("Пловдив 2026 г.\n\nСледва процедура.","Пловдив 2026 г. Следва процедура.")).toBe(true);
 expect(smartEvidenceContains("Пловдив 2026 г.","Пловдив 2025 г.")).toBe(false);
 expect(smartEvidenceContains("Пловдив 2026 г.","Русе 2026 г.")).toBe(false);
 expect(smartEvidenceContains("Пловдив 2026 г.","")).toBe(false);
});
it("rejects a related article id without a corresponding verified own source",()=>{
 expect(()=>validateSmartEvidence({status:"insufficient",blocks:[{text:"QA",sourceIds:[]}],sources:[],relatedArticleIds:["00000000-0000-4000-8000-000000000002"],followUps:[],checkedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1000).toISOString()})).toThrow("unknown_related_article");
});

it("hides outgoing citations in reader copy without changing the stored evidence",()=>{
 expect(smartReaderText('Според биографичния профил на Slava.bg тя започва във вестник „Труд“.',['https://slava.bg/profile'])).toBe('По наличната информация тя започва във вестник „Труд“.');
 expect(smartReaderText('Информация https://example.org/page')).not.toContain('https://');
 const source={id:'external-qa',articleId:null,kind:'external' as const,title:'QA external',url:'https://example.org/page',passage:'Full evidence stays on server',version:'qa',publishedAt:null,checkedAt:new Date().toISOString()};
 const original={id:'qa',usedQuestions:1,maxQuestions:5,updated:false,turns:[{id:'qa',question:'QA',status:'completed' as const,cached:true,answer:{status:'insufficient' as const,blocks:[{text:'QA факт',sourceIds:[source.id]}],sources:[source],followUps:[],checkedAt:source.checkedAt,expiresAt:source.checkedAt}}]};
 const reader=readerSmartSession(original);expect(reader.turns[0]!.answer!.sources).toEqual([]);expect(reader.turns[0]!.answer!.blocks[0]!.sourceIds).toEqual([]);expect(original.turns[0]!.answer.sources[0]!.passage).toBe('Full evidence stays on server');
});
