import Link from "next/link";
import type { ArticleSummary } from "@/lib/queries";
import { categoryAccentStyle } from "@/lib/category-accent";
import { isRecentArticle } from "@/lib/format";
import { ArticleImage, CategoryLabel, CategoryPill, NewBadge, TimeMeta } from "./ui";

/**
 * Mobile lead card: image up top with category overlay, title BELOW the image.
 * Per MOBILE_PLAN.md the title is never ellipsised on the first screen — long
 * titles keep reading with scroll. The image shrinks to its floor (16rem) for
 * very long titles so the headline stays visible without scrolling.
 */
export function MobileLeadCard({
  article,
  priority = false,
}: {
  article: ArticleSummary;
  priority?: boolean;
}) {
  return (
    <article
      className="group np-news-card relative isolate overflow-hidden rounded-3xl border border-line bg-surface shadow-card"
      style={categoryAccentStyle(article.category?.slug)}
    >
      <Link href={article.path} prefetch={false} aria-label={article.title} className="block">
        <div className="relative">
          <ArticleImage
            media={article.hero}
            priority={priority}
            sizes="100vw"
            className="aspect-[3/2] max-h-[min(42svh,16rem)] w-full object-cover object-[center_30%]"
          />
          {article.category ? (
            <CategoryPill category={article.category} className="absolute top-3 left-3" glass />
          ) : null}
          {isRecentArticle(article.publishedAt) ? (
            <span className="absolute top-3 right-3"><NewBadge publishedAt={article.publishedAt} /></span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 p-4">
          <Heading
            level="h2"
            className="text-[1.375rem] leading-[1.18] font-extrabold tracking-[-0.012em] text-balance text-ink"
            text={article.title}
          />
          <div className="flex items-center gap-2 text-xs font-semibold text-muted">
            <TimeMeta date={article.publishedAt} relative />
            <span className="text-line" aria-hidden="true">•</span>
            <span className="truncate">{article.authorName}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}

/**
 * Mobile first supporting card: photo on the left, title and category on the
 * right. The image is small (~7.5rem) and 16/9 so it sits beside the title
 * without dominating it.
 */
export function MobileSupportingCard({ article }: { article: ArticleSummary }) {
  return (
    <article
      className="group np-news-card overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
      style={categoryAccentStyle(article.category?.slug)}
    >
      <Link href={article.path} prefetch={false} aria-label={article.title} className="flex items-stretch gap-3 p-2.5">
        <div className="relative shrink-0 self-start">
          <ArticleImage
            media={article.hero}
            sizes="120px"
            className="aspect-[16/9] w-[7.5rem] rounded-xl object-cover"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-1.5 pr-1.5">
          {article.category ? <CategoryLabel category={article.category} /> : null}
          <Heading
            level="h3"
            className="text-base leading-snug font-extrabold tracking-[-0.012em] text-balance text-ink"
            text={article.title}
            clampLines={2}
          />
          <TimeMeta date={article.publishedAt} relative className="mt-auto text-xs" />
        </div>
      </Link>
    </article>
  );
}

/**
 * Mobile compact row: title, category and time in one card without a second
 * big photo. Used after the supporting card for the third and fourth stories.
 */
export function MobileCompactRow({ article }: { article: ArticleSummary }) {
  return (
    <article className="group" style={categoryAccentStyle(article.category?.slug)}>
      <Link
        href={article.path}
        prefetch={false}
        aria-label={article.title}
        className="flex min-h-11 flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <div className="flex items-center justify-between gap-2 text-[0.6875rem] font-semibold tracking-wide text-muted">
          {article.category ? <CategoryLabel category={article.category} /> : <span />}
          <TimeMeta date={article.publishedAt} relative />
        </div>
        <Heading
          level="h3"
          className="text-[0.95rem] leading-snug font-bold text-ink group-hover:text-logo"
          text={article.title}
          clampLines={2}
        />
      </Link>
    </article>
  );
}

function Heading({
  text,
  className,
  clampLines,
  level = "h3",
}: {
  text: string;
  className?: string;
  clampLines?: number;
  level?: "h2" | "h3";
}) {
  const Tag = level;
  const clampClass = clampLines === 2 ? "line-clamp-2" : "";
  return <Tag className={`${clampClass} ${className ?? ""}`}>{text}</Tag>;
}