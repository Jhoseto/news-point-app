export class ScheduledPublishConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledPublishConflictError";
  }
}

/** First publication timestamp: automatic server time, or a chosen Sofia instant (incl. backdating). */
export function resolveFirstPublishedAt(article: { scheduledPublishAt: Date | null }, now = new Date()): Date {
  if (!article.scheduledPublishAt) return now;
  if (article.scheduledPublishAt.getTime() > now.getTime()) {
    throw new ScheduledPublishConflictError(
      "Избраният час е в бъдеще. Запишете и изчакайте автоматичното публикуване, или задайте минал/настоящ момент преди „Публикувай“.",
    );
  }
  return article.scheduledPublishAt;
}
