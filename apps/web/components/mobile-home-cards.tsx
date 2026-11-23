import Link from "next/link";
import type { ArticleSummary } from "@/lib/queries";
import { categoryAccentStyle } from "@/lib/category-accent";
import { formatExactPublishTime, isRecentArticle, isoDate } from "@/lib/format";
import { ClockIcon } from "./icons";
import { ArticleImage, CategoryLabel, CategoryPill, NewBadge, TimeMeta } from "./ui";
import { ClampedTitleTip } from "./clamped-title-tip";

/**
 * Archives keep the image above the headline. The homepage opts into an
 * on-photo headline; its in-flow text can grow rather than being clipped.
 */
export function MobileLeadCard({
  article,
  priority = false,
  now = new Date(),
  overlay = false,
}: {
  article: ArticleSummary;
  priority?: boolean;
  now?: Date;
  overlay?: boolean;
}) {
  if (overlay) return (
    <article className="np-mobile-home-lead group np-news-card relative isolate overflow-hidden rounded-3xl border border-line shadow-card" style={categoryAccentStyle(article.category?.slug)}>
      <Link href={article.path} prefetch={false} aria-label={article.title} className="np-mobile-home-lead-link">
        <ArticleImage media={article.hero} priority={priority} sizes="100vw" className="np-mobile-home-lead-image" />
        <div className="np-mobile-home-lead-labels">
          {article.category ? <CategoryPill category={article.category} glass={!!article.hero} /> : null}
          {isRecentArticle(article.publishedAt, now) ? <NewBadge publishedAt={article.publishedAt} compact /> : null}
        </div>
        <div className="np-mobile-home-lead-copy">
          <Heading level="h2" className="np-mobile-home-lead-title" text={article.title} />
          <div className="np-mobile-home-lead-meta">
            <TimeMeta date={article.publishedAt} relative now={now} />
            <span className="truncate">{article.authorName}</span>
          </div>
        </div>
      </Link>
    </article>
  );
  return (
    <article
      className="group np-news-card relative isolate min-h-[20rem] overflow-hidden rounded-3xl border border-line bg-surface shadow-card"
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
            <CategoryPill category={article.category} className="absolute top-3 left-3" glass={!!article.hero} />
          ) : null}
          {isRecentArticle(article.publishedAt, now) ? (
            <span className="absolute top-2.5 right-2.5"><NewBadge publishedAt={article.publishedAt} compact /></span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 p-4">
          <Heading
            level="h2"
            className="text-[1.375rem] leading-[1.18] font-extrabold tracking-[-0.012em] text-balance text-ink"
            text={article.title}
          />
          <div className="flex items-center gap-2 text-xs font-semibold text-muted">
            <TimeMeta date={article.publishedAt} relative now={now} />
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
export function MobileSupportingCard({ article, priority = false, now = new Date(), featured = false }: { article: ArticleSummary; priority?: boolean; now?: Date; featured?: boolean }) {
  return (
    <article
      className={`group np-news-card overflow-hidden rounded-2xl border border-line bg-surface shadow-card${featured ? " np-mobile-home-support" : ""}`}
      style={categoryAccentStyle(article.category?.slug)}
    >
      <Link href={article.path} prefetch={false} aria-label={article.title} className="flex items-stretch gap-3 p-2.5">
        <div className="relative shrink-0 self-start">
          <ArticleImage
            media={article.hero}
            priority={priority}
            sizes={featured ? "(min-width: 640px) 40vw, 144px" : "120px"}
            className="aspect-[16/9] w-[7.5rem] rounded-xl object-cover"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-1.5 pr-1.5">
          {article.category ? <CategoryLabel category={article.category} /> : null}
          <Heading
            level="h3"
            className="text-base leading-snug font-extrabold tracking-[-0.012em] text-balance text-ink"
            text={article.title}
            clampLines={featured ? 3 : 2}
          />
          <TimeMeta date={article.publishedAt} relative now={now} className="mt-auto text-xs" />
        </div>
      </Link>
    </article>
  );
}

/**
 * Elongated rubric-feed card: photo left, title and meta right. Used on
 * category archive pages after the lead and two supporting cards.
 */
export function MobileHorizonCard({ article, priority = false, now = new Date() }: { article: ArticleSummary; priority?: boolean; now?: Date }) {
  return (
    <article
      className="group np-news-card overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
      style={categoryAccentStyle(article.category?.slug)}
    >
      <Link href={article.path} prefetch={false} aria-label={article.title} className="flex items-stretch gap-3 p-3">
        <div className="relative w-[8.75rem] shrink-0 overflow-hidden rounded-xl sm:w-36">
          <ArticleImage
            media={article.hero}
            priority={priority}
            sizes="144px"
            className="h-full min-h-[5.25rem] w-full object-cover object-[center_30%]"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-0.5 pr-1">
          {article.category ? <CategoryLabel category={article.category} /> : null}
          <Heading
            level="h3"
            className="text-[0.98rem] leading-snug font-extrabold tracking-[-0.012em] text-balance text-ink group-hover:text-logo"
            text={article.title}
            clampLines={3}
          />
          <TimeMeta date={article.publishedAt} relative now={now} className="text-xs text-muted" />
        </div>
      </Link>
    </article>
  );
}

/**
 * Mobile compact row: title, category and time in one card without a second
 * big photo. Used on the homepage feed after the supporting cards.
 */
export function MobileCompactRow({ article, now = new Date() }: { article: ArticleSummary; now?: Date }) {
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
          <TimeMeta date={article.publishedAt} relative now={now} />
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

/**
 * Mobile small card: 4/3 photo, category pill, two-line title and time.
 * Used as the third and fourth slots on the leading composition — sits in a
 * 2-up grid (`MobileSmallPair`) so each card stays readable on a 360 px
 * viewport.
 */
export function MobileSmallCard({ article, priority = false, now = new Date(), tabbable = true, liteMedia = false, exactTime = false }: { article: ArticleSummary; priority?: boolean; now?: Date; tabbable?: boolean; liteMedia?: boolean; exactTime?: boolean }) {
  return (
    <article
      className="group np-news-card relative isolate flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
      style={categoryAccentStyle(article.category?.slug)}
    >
      <Link href={article.path} prefetch={false} aria-label={article.title} tabIndex={tabbable ? undefined : -1} className="flex h-full flex-col">
        <div className="relative">
          <ArticleImage
            media={article.hero}
            priority={priority}
            lite={liteMedia}
            sizes="(min-width: 360px) 45vw, 50vw"
            className="aspect-[4/3] w-full object-cover object-[center_30%]"
          />
          {article.category ? (
            <CategoryPill category={article.category} className="absolute top-2 left-2" glass={!!article.hero} />
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <Heading
            level="h3"
            className="text-sm leading-snug font-bold tracking-[-0.01em] text-balance text-ink"
            text={article.title}
            clampLines={3}
          />
          {exactTime ? (
            <time dateTime={isoDate(article.publishedAt)} className="np-carousel-exact-time mt-auto text-[0.6875rem]">
              <ClockIcon width={13} height={13} />{formatExactPublishTime(article.publishedAt)}
            </time>
          ) : <TimeMeta date={article.publishedAt} relative now={now} className="mt-auto text-[0.6875rem]" />}
        </div>
      </Link>
    </article>
  );
}

/**
 * Two `MobileSmallCard` side by side. The pair reads as a single horizontal
 * band between the medium supporting card and the dense compact rows below;
 * the cards are equal-height via a grid row so titles line up across columns.
 */
export function MobileSmallPair({ left, right, priority = false, now = new Date() }: { left: ArticleSummary; right: ArticleSummary; priority?: boolean; now?: Date }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <MobileSmallCard article={left} priority={priority} now={now} />
      <MobileSmallCard article={right} priority={priority} now={now} />
    </div>
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
  const clampClass =
    clampLines === 2 ? "line-clamp-2" : clampLines === 3 ? "line-clamp-3" : "";
  const merged = `${clampClass} ${className ?? ""}`.trim();
  if (clampLines) {
    return (
      <ClampedTitleTip as={level} className={merged}>
        {text}
      </ClampedTitleTip>
    );
  }
  return <Tag className={merged}>{text}</Tag>;
}
