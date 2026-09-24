import { createHash } from "node:crypto";
import type { LatestHeadline } from "./types";
import type { ArticleSummary } from "@/lib/queries";

export function toLatestHeadline(article: ArticleSummary | undefined): LatestHeadline | null {
  if (!article) return null;
  return {
    id: article.id,
    path: article.path,
    title: article.title,
    publishedAt: article.publishedAt.toISOString(),
  };
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}
