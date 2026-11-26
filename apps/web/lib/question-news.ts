import type { ArticleSummary } from "./queries";
import { distinctRecommendations, recommendationTerms } from "./article-recommendations";

export const recentQuestionNewsMs = 90 * 86_400_000;

/** SQL finds possible substrings. Check word starts so e.g. „компенсира“ cannot match „пенси“. */
export function questionNewsCandidates(stories: ArticleSummary[], alternatives: string[]) {
  const groups = alternatives.map(phrase => phrase.toLocaleLowerCase("bg").split(/\s+/u));
  return stories.filter(story => {
    return [story.title, story.excerpt].some(field => {
      const words = field.toLocaleLowerCase("bg").match(/[\p{L}\p{N}-]+/gu) ?? [];
      // Terms must describe the same passage, even when a summary covers several issues.
      return groups.some(group => words.some((word, i) => {
        if (!group.some(term => word.startsWith(term))) return false;
        const passage = words.slice(i, i + 14);
        return group.every(term => passage.some(token => token.startsWith(term)));
      }));
    });
  });
}

export function selectQuestionNews(direct: ArticleSummary[], context: ArticleSummary[], now: number, limit = 8) {
  const cutoff = now - recentQuestionNewsMs;
  // Each input is in archive date order. Prefer exact recent coverage, then current context.
  const ordered = [direct, context].flatMap(pool => pool.filter(a => a.publishedAt.getTime() >= cutoff))
    .concat(...[direct, context].map(pool => pool.filter(a => a.publishedAt.getTime() < cutoff)));
  return distinctRecommendations(ordered.map(article => ({ article, titleTerms: new Set(recommendationTerms(article.title)) })), limit)
    .sort((a,b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.id.localeCompare(b.id));
}
