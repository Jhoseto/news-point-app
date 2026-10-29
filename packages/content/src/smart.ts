import { z } from "zod";

export const SMART_QUESTION_LIMIT = 5;
export const SMART_PROMPT_VERSION = "smart-2026-10-29-v1";
const text = z.string().trim().min(1);
export const smartQuestionSchema = z.object({ id: text.max(160), text: text.max(220) });
export type SmartQuestion = z.infer<typeof smartQuestionSchema>;
export const smartSourceSchema = z.object({
  id: text.max(200), title: text.max(500), url: z.string().url(),
  kind: z.enum(["current", "newspoint", "official", "external"]),
  articleId: z.uuid().nullable(), version: z.string().nullable(),
  publishedAt: z.string().nullable(), checkedAt: z.string(), passage: text.max(20_000),
});
export type SmartSource = z.infer<typeof smartSourceSchema>;
export const smartAnswerSchema = z.object({
  status: z.enum(["answered", "insufficient", "off_topic"]),
  blocks: z.array(z.object({ text: text.max(4000), sourceIds: z.array(text.max(200)).max(12) })).min(1).max(8),
  followUps: z.array(smartQuestionSchema).max(3),
  sources: z.array(smartSourceSchema).max(20),
  checkedAt: z.string(), expiresAt: z.string(),
});
export type SmartAnswer = z.infer<typeof smartAnswerSchema>;
export type SmartCard = { articleId: string; title: string; path: string; reason: string; publishedAt: string };
export type SmartTurn = { id: string; question: string; status: "pending" | "completed" | "failed"; answer: SmartAnswer | null; cached: boolean };
export type SmartBootstrap = {
  status: "ready" | "preparing" | "unavailable"; articleId: string; version: string;
  questions: SmartQuestion[]; related: SmartCard | null; message?: string;
};
export type SmartSession = { id: string; usedQuestions: number; maxQuestions: number; turns: SmartTurn[]; updated: boolean };

export function normalizeSmartQuestion(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("bg").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function freshSmartAnswer(answer: SmartAnswer, now = Date.now()): boolean {
  return Number.isFinite(Date.parse(answer.checkedAt)) && Date.parse(answer.expiresAt) > now
    && Date.parse(answer.checkedAt) <= now + 60_000;
}
export function validateSmartEvidence(answer: SmartAnswer): SmartAnswer {
  const parsed = smartAnswerSchema.parse(answer);
  const ids = new Set(parsed.sources.map(s => s.id));
  if (ids.size !== parsed.sources.length) throw new Error("duplicate_source");
  for (const block of parsed.blocks) {
    if (parsed.status === "answered" && !block.sourceIds.length) throw new Error("missing_evidence");
    if (block.sourceIds.some(id => !ids.has(id))) throw new Error("unknown_evidence");
  }
  for (const source of parsed.sources) {
    const url = new URL(source.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("unsafe_source");
  }
  if (new Set(parsed.followUps.map(q => normalizeSmartQuestion(q.text))).size !== parsed.followUps.length) throw new Error("duplicate_question");
  return parsed;
}

export type AiUsage = { input: number; cachedInput: number; cacheWrite: number; output: number; reasoning: number; searches: number };
export type AiRate = { input: string; cachedInput: string; cacheWrite: string; output: string; search: string; version: string };
// Rates are USD per million tokens; search is USD per individual billable call.
export const AI_RATES: Record<string, AiRate> = {
  "gpt-6.1-sol": { input: "2", cachedInput: "0.10", cacheWrite: "2.50", output: "10", search: "0.01", version: "2026-10-29-standard-short" },
  "gpt-6.1-terra": { input: "1", cachedInput: "0.05", cacheWrite: "1.25", output: "5", search: "0.01", version: "2026-10-29-standard-short" },
  "gpt-6-luna": { input: "0.10", cachedInput: "0.01", cacheWrite: "0.125", output: "0.50", search: "0.01", version: "2026-10-29-standard-short" },
  "text-embedding-3-small": { input: "0.02", cachedInput: "0.02", cacheWrite: "0.02", output: "0", search: "0", version: "2026-10-29-standard" },
};
function decimalUnits(value: string, places: number): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("invalid_decimal");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > places) throw new Error("decimal_precision");
  return BigInt(whole!) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
}
export function aiCostUsd(usage: AiUsage, rate: AiRate): string {
  for (const n of Object.values(usage)) if (!Number.isSafeInteger(n) || n < 0) throw new Error("invalid_usage");
  if (usage.cachedInput + usage.cacheWrite > usage.input || usage.reasoning > usage.output) throw new Error("inconsistent_usage");
  const raw = BigInt(usage.input - usage.cachedInput - usage.cacheWrite) * decimalUnits(rate.input, 6)
    + BigInt(usage.cachedInput) * decimalUnits(rate.cachedInput, 6)
    + BigInt(usage.cacheWrite) * decimalUnits(rate.cacheWrite, 6)
    + BigInt(usage.output) * decimalUnits(rate.output, 6)
    + BigInt(usage.searches) * decimalUnits(rate.search, 12);
  return `${raw / 1_000_000_000_000n}.${String(raw % 1_000_000_000_000n).padStart(12, "0")}`;
}

export function safeCsvCell(value: unknown): string {
  const raw = String(value ?? "");
  return `"${(/^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw).replaceAll('"', '""')}"`;
}
