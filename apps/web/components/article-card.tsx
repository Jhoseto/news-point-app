import Link from "next/link";
import type { ArticleSummary } from "@/lib/queries";
import { formatClock, isRecentArticle, isoDate } from "@/lib/format";
import { categoryAccentStyle } from "@/lib/category-accent";
import { cardShineStyle } from "@/lib/shine-style";
import { ArrowRightIcon } from "./icons";
import { ArticleImage, CategoryLabel, CategoryPill, NewBadge, TimeMeta } from "./ui";

/**
 * Story with the title over the photo. "lead" is the top story; "tile" is the
 * smaller version for supporting stories and mosaic sections.
 * Story links do not prefetch: a cached article is a full page, and the homepage
 * has too many of them in view.
 */
export function HeroCard({
  article,
  headingLevel = "h2",
  size = "lead",
  fit = "natural",
  className = "",
  shineDelaySec,
  priority = false,
}: {
  article: ArticleSummary;
  headingLevel?: "h1" | "h2" | "h3";
  size?: "lead" | "tile" | "mini";
  /** "band" fills a parent with a fixed height. The homepage desktop hero uses it. */
  fit?: "natural" | "band";
  className?: string;
  /** Homepage orchestrated shine delay (seconds into the cycle). */
  shineDelaySec?: number;
  priority?: boolean;
}) {
  const Heading = headingLevel;
  const lead = size === "lead";
  const mini = size === "mini";
  const tile = size === "tile";
  const fullBleedPhoto = fit === "band" || tile;
  const shine = cardShineStyle(shineDelaySec);
  const imageFitClass = fullBleedPhoto
    ? "h-full w-full object-cover object-[center_28%]"
    : lead
      ? "aspect-[3/2] h-full w-full object-cover object-[center_30%]"
      : "aspect-[16/10] h-full w-full object-cover object-[center_30%]";
  return (
    <article
      className={`group np-news-card np-card-ring np-card-ring-onphoto np-spotlight np-spotlight-onphoto relative isolate h-full overflow-hidden border border-white/10 bg-[#020826] shadow-[0_18px_55px_-26px_rgb(10_20_84/0.65)] ${lead ? "rounded-3xl" : "rounded-2xl"} ${className}`}
      data-spotlight
      style={categoryAccentStyle(article.category?.slug)}
    >
      <Link
        href={article.path}
        prefetch={false}
        className={`relative block h-full ${tile && fit === "natural" ? "min-h-[14rem] sm:min-h-[16rem] 2xl:min-h-0" : ""}`}
      >
        <div className={`${shine.className} ${fullBleedPhoto ? "absolute inset-0" : "relative"}`} style={shine.style}>
          <ArticleImage
            media={article.hero}
            priority={priority}
            sizes={lead ? "(min-width: 1536px) 42vw, (min-width: 1024px) 46vw, 100vw" : mini ? "(min-width: 1024px) 22vw, 50vw" : "(min-width: 1024px) 22vw, 100vw"}
            className={`transition-[scale,filter] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] group-hover:brightness-[1.04] ${imageFitClass}`}
          />
        </div>
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent ${
            lead
              ? "h-[70%] from-[#020826]/88 via-[#020826]/45"
              : mini
                ? "h-[76%] from-black/85 via-black/35"
                : "h-[80%] from-[#020826]/95 via-[#020826]/55"
          }`}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/65 to-transparent opacity-75" aria-hidden="true" />
        {article.category ? <CategoryPill category={article.category} className={`absolute z-10 ${mini ? "top-2 left-2" : "top-3 left-3"}`} /> : null}
        {!mini && isRecentArticle(article.publishedAt) ? <span className="absolute top-3 right-3 z-20"><NewBadge publishedAt={article.publishedAt} /></span> : null}
        <div className={`absolute inset-x-0 bottom-0 flex flex-col ${lead ? "gap-3 p-5 sm:p-7 lg:p-8" : mini ? "gap-1.5 p-3" : "gap-2.5 p-4 sm:p-5"}`}>
          <Heading
            className={
              lead
                ? "line-clamp-3 max-w-3xl text-xl leading-[1.18] font-extrabold tracking-tight text-balance text-white [text-shadow:0_2px_8px_rgb(0_0_0/0.9),0_1px_2px_rgb(0_0_0/0.95)] sm:line-clamp-4 sm:text-2xl lg:text-[1.85rem] xl:text-[2rem]"
                : mini
                  ? "line-clamp-3 text-sm leading-snug font-extrabold tracking-tight text-balance text-white [text-shadow:0_2px_6px_rgb(0_0_0/0.85)]"
                  : "line-clamp-3 text-lg leading-snug font-extrabold tracking-tight text-balance text-white [text-shadow:0_2px_8px_rgb(0_0_0/0.9),0_1px_2px_rgb(0_0_0/0.95)]"
            }
          >
            {article.title}
          </Heading>
          {lead && article.excerpt ? (
            <p className="hidden max-w-2xl text-[0.95rem] leading-relaxed text-white/82 sm:line-clamp-2">{article.excerpt}</p>
          ) : null}
          <div className={`flex items-center justify-between gap-4 ${lead ? "mt-1 border-t border-white/15 pt-3" : ""}`}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-white/75 [text-shadow:0_1px_4px_rgb(0_0_0/0.75)]">
              <TimeMeta date={article.publishedAt} relative={!mini} className="text-white/75" />
              {!mini ? <><span className="text-white/35" aria-hidden="true">•</span><span className="truncate text-xs font-medium">{article.authorName}</span></> : null}
            </div>
            {lead ? (
              <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-medium tracking-wide text-[#0a1454] shadow-lg [text-shadow:none] antialiased transition-transform duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1">
                <span className="hidden sm:inline">Прочети</span>
                <ArrowRightIcon width={18} height={18} strokeWidth={2} />
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}

/** Standard grid card: photo on top, label, title, time. */
export function ArticleCard({
  article,
  showExcerpt = false,
  shineDelaySec,
  tabbable = true,
}: {
  article: ArticleSummary;
  showExcerpt?: boolean;
  shineDelaySec?: number;
  /** False on the carousel's visual copy so Tab skips the duplicate links. */
  tabbable?: boolean;
}) {
  const shine = cardShineStyle(shineDelaySec);
  return (
    <article data-spotlight className="group np-card np-news-card np-card-ring np-spotlight relative flex h-full w-full flex-col overflow-hidden" style={categoryAccentStyle(article.category?.slug)}>
      <span className="np-category-accent-line absolute inset-x-8 top-0 z-10 h-px opacity-0 transition-opacity duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100" aria-hidden="true" />
      <Link href={article.path} prefetch={false} tabIndex={tabbable ? undefined : -1} className="flex h-full flex-col">
        <div className={`relative ${shine.className}`} style={shine.style}>
          <ArticleImage
            media={article.hero}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="aspect-[16/10] w-full transition-[scale,filter] duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.045] group-hover:brightness-[1.03]"
          />
          {isRecentArticle(article.publishedAt) ? <span className="absolute top-3 right-3 z-20"><NewBadge publishedAt={article.publishedAt} /></span> : null}
        </div>
        <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            {article.category ? <CategoryLabel category={article.category} /> : <span />}
            <TimeMeta date={article.publishedAt} relative className="shrink-0" />
          </div>
          <h3 className="line-clamp-3 text-[1.02rem] leading-snug font-extrabold tracking-[-0.012em] text-ink transition-colors duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-logo">
            {article.title}
          </h3>
          {showExcerpt && article.excerpt ? (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted">{article.excerpt}</p>
          ) : null}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="truncate text-xs font-semibold text-muted">{article.authorName}</span>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-logo transition-[background-color,color,translate] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5 group-hover:bg-accent group-hover:text-on-accent" aria-hidden="true"><ArrowRightIcon width={14} height={14} /></span>
          </div>
        </div>
      </Link>
    </article>
  );
}

/** Horizontal feature: big photo left, text right. */
export function FeatureCard({ article, shineDelaySec }: { article: ArticleSummary; shineDelaySec?: number }) {
  const shine = cardShineStyle(shineDelaySec);
  return (
    <article data-spotlight className="group np-card np-news-card np-card-ring np-spotlight relative overflow-hidden" style={categoryAccentStyle(article.category?.slug)}>
      <span className="np-category-accent-line absolute inset-y-8 left-0 z-10 w-px opacity-70" aria-hidden="true" />
      <Link href={article.path} prefetch={false} className="grid h-full sm:grid-cols-[1.15fr_1fr]">
        <div className={`relative ${shine.className}`} style={shine.style}>
          <ArticleImage
            media={article.hero}
            sizes="(min-width: 1024px) 33vw, 100vw"
            className="aspect-[16/10] h-full w-full transition-[scale,filter] duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.045] group-hover:brightness-[1.03]"
          />
          {isRecentArticle(article.publishedAt) ? <span className="absolute top-3 right-3 z-20"><NewBadge publishedAt={article.publishedAt} /></span> : null}
        </div>
        <div className="flex flex-col gap-3 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            {article.category ? <CategoryLabel category={article.category} /> : <span />}
            <TimeMeta date={article.publishedAt} relative className="shrink-0" />
          </div>
          <h3 className="text-xl leading-snug font-extrabold tracking-[-0.015em] text-ink transition-colors duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-logo">
            {article.title}
          </h3>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="truncate text-xs font-semibold text-muted">{article.authorName}</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-link">Прочети <ArrowRightIcon width={14} height={14} /></span>
          </div>
        </div>
      </Link>
    </article>
  );
}

/** Compact row: small thumbnail and title. */
export function CompactCard({ article, shineDelaySec }: { article: ArticleSummary; shineDelaySec?: number }) {
  const shine = cardShineStyle(shineDelaySec);
  return (
    <article className="group">
      <Link href={article.path} prefetch={false} className="np-news-card relative flex items-start gap-3 rounded-xl p-1.5 -m-1.5 transition-colors duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-surface-2">
        <div className={`${shine.className} shrink-0 rounded-lg`} style={shine.style}>
          <ArticleImage media={article.hero} sizes="112px" className="aspect-[4/3] w-24 rounded-lg sm:w-28" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          {article.category ? <CategoryLabel category={article.category} /> : null}
          <h3 className="line-clamp-3 text-sm leading-snug font-bold text-ink transition-colors duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-logo">
            {article.title}
          </h3>
          <TimeMeta date={article.publishedAt} />
        </div>
      </Link>
    </article>
  );
}

/** Timeline row for the "Последни новини" list. */
export function TimelineItem({ article, className = "" }: { article: ArticleSummary; className?: string }) {
  return (
    <li className={`group relative pl-16 ${className}`}>
      <time dateTime={isoDate(article.publishedAt)} className="absolute top-0.5 left-0 text-xs font-bold text-muted tabular-nums">
        {formatClock(article.publishedAt)}
      </time>
      <span className="np-gradient-bg absolute top-1.5 left-12 size-2 rounded-full ring-4 ring-surface" aria-hidden="true" />
      <Link href={article.path} prefetch={false} className="flex min-h-11 flex-col justify-center">
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-ink transition-colors duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-logo">
          {article.title}
        </h3>
        {article.category ? <span className="mt-0.5 block text-xs text-muted">{article.category.name}</span> : null}
      </Link>
    </li>
  );
}
