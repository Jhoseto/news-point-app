export function publicArticleModifiedAt(input: {
  publishedAt: Date;
  publishedRevisionAt?: Date | null | undefined;
  sourceModifiedAt?: Date | null | undefined;
}): Date {
  const candidates = [input.publishedAt, input.publishedRevisionAt, input.sourceModifiedAt]
    .filter((value): value is Date => value instanceof Date && Number.isFinite(value.getTime()));
  return new Date(Math.max(...candidates.map((value) => value.getTime())));
}
