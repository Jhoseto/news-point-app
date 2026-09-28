export const ARTICLE_READ_MINIMUM_MS = 8_000;
export const ARTICLE_READ_MINIMUM_PROGRESS = 0.35;

export function isEngagedArticleRead(elapsedMs: number, progress: number) {
  return elapsedMs >= ARTICLE_READ_MINIMUM_MS && progress >= ARTICLE_READ_MINIMUM_PROGRESS;
}
