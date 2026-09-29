import type { ArticleSummary } from "./queries";

const STOP_WORDS = new Set([
  "автор", "беше", "били", "било", "бъдат", "българия", "вече", "всички", "всяка", "днес",
  "докато", "дори", "друг", "друга", "други", "един", "една", "защо", "като", "които", "която",
  "който", "към", "между", "може", "много", "няма", "нова", "нови", "новина", "новини", "около",
  "отново", "още", "преди", "през", "след", "срещу", "стана", "това", "този", "трябва", "какво",
  "ще", "нейната", "неговата", "своята", "съобщи", "заяви", "каза",
]);

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("bg-BG").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function recommendationTerms(value: string): string[] {
  return [...new Set(normalized(value).split(/\s+/).filter((term) => term.length >= 4 && !STOP_WORDS.has(term)))];
}

function bigrams(value: string): Set<string> {
  const terms = recommendationTerms(value);
  return new Set(terms.slice(0, -1).map((term, index) => `${term} ${terms[index + 1]}`));
}

function intersection(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((term) => right.has(term));
}

function daysOld(date: Date, now: Date): number {
  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function similarity(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  const common = intersection(left, right).length;
  return common / (left.size + right.size - common);
}

export interface RecommendationOptions {
  limit?: number;
  now?: Date;
  excludeIds?: Iterable<string>;
}

/**
 * Transparent first-pass story ranking. Old archive items need much stronger
 * textual evidence than fresh items; sharing a rubric is never sufficient.
 */
export function rankArticleRecommendations(
  current: ArticleSummary,
  candidates: ArticleSummary[],
  options: RecommendationOptions = {},
): ArticleSummary[] {
  const now = options.now ?? new Date();
  const excluded = new Set([current.id, ...(options.excludeIds ?? [])]);
  const currentTitle = new Set(recommendationTerms(current.title));
  const currentAll = new Set(recommendationTerms(`${current.title} ${current.excerpt}`));
  const currentBigrams = bigrams(current.title);

  const scored = candidates.flatMap((candidate) => {
    if (excluded.has(candidate.id)) return [];
    const candidateTitle = new Set(recommendationTerms(candidate.title));
    const candidateAll = new Set(recommendationTerms(`${candidate.title} ${candidate.excerpt}`));
    const titleMatches = intersection(currentTitle, candidateTitle);
    const allMatches = intersection(currentAll, candidateAll);
    const phraseMatches = intersection(currentBigrams, bigrams(candidate.title));
    const oldDays = daysOld(candidate.publishedAt, now);

    // A rubric or one incidental context word is not a topic signal.
    if (!titleMatches.length && allMatches.length < 2) return [];
    // Background from the archive enters only with an exact phrase or several title anchors.
    if (oldDays > 730 && phraseMatches.length === 0 && titleMatches.length < 3) return [];
    if (oldDays > 60 && phraseMatches.length === 0 && titleMatches.length < 2) return [];

    const titleScore = titleMatches.reduce((sum, term) => sum + Math.min(11, 6 + Math.max(0, term.length - 5)), 0);
    const contextScore = Math.min(18, allMatches.length * 3);
    const phraseScore = Math.min(28, phraseMatches.length * 14);
    const categoryScore = current.category?.id && current.category.id === candidate.category?.id ? 8 : 0;
    const freshnessScore = oldDays <= 7 ? 16 : oldDays <= 30 ? 12 : oldDays <= 60 ? 8 : oldDays <= 365 ? 4 : 0;
    const score = titleScore + contextScore + phraseScore + categoryScore + freshnessScore;
    const minimum = oldDays <= 60 ? 17 : oldDays <= 730 ? 25 : 42;
    return score >= minimum ? [{ article: candidate, score, titleTerms: candidateTitle }] : [];
  }).sort((left, right) => right.score - left.score
    || right.article.publishedAt.getTime() - left.article.publishedAt.getTime()
    || left.article.id.localeCompare(right.article.id));

  const selected: typeof scored = [];
  for (const candidate of scored) {
    if (selected.some((item) => similarity(item.titleTerms, candidate.titleTerms) >= 0.72)) continue;
    selected.push(candidate);
    if (selected.length === (options.limit ?? 8)) break;
  }
  return selected.map(({ article }) => article);
}
