import Link from "next/link";
import type { ArticleSummary } from "@/lib/queries";
import { formatClock, isoDate } from "@/lib/format";
import { ArrowRightIcon } from "./icons";
import { ArticleImage, CategoryLabel, CategoryPill, TimeMeta } from "./ui";

/** Large lead story with the title over the photo. */
export function HeroCard({ article, headingLevel = "h2" }: { article: ArticleSummary; headingLevel?: "h1" | "h2" }) {
  const Heading = headingLevel;
  return (
    <article className="group relative isolate h-full overflow-hidden rounded-3xl shadow-card">
      <Link href={article.path} className="block h-full">
        <ArticleImage
          media={article.hero}
          priority
          sizes="(min-width: 1024px) 66vw, 100vw"
          className="aspect-[4/5] h-full w-full transition-transform duration-700 group-hover:scale-[1.03] sm:aspect-[16/10] lg:aspect-auto lg:min-h-[30rem]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#020826]/95 via-[#020826]/45 to-transparent" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 sm:p-7 lg:p-8">
          {article.category ? <CategoryPill category={article.category} className="self-start" /> : null}
          <Heading className="max-w-3xl text-2xl leading-tight font-extrabold tracking-tight text-balance text-white sm:text-3xl lg:text-[2.35rem]">
            {article.title}
          </Heading>
          {article.excerpt ? (
            <p className="hidden max-w-2xl text-[0.95rem] leading-relaxed text-white/85 sm:line-clamp-2">{article.excerpt}</p>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <TimeMeta date={article.publishedAt} className="text-white/80" />
            <span className="flex size-10 items-center justify-center rounded-full bg-white text-[#0a1454] transition-transform group-hover:translate-x-1">
              <ArrowRightIcon width={18} height={18} />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

/** Standard grid card: photo on top, label, title, time. */
export function ArticleCard({ article, showExcerpt = false }: { article: ArticleSummary; showExcerpt?: boolean }) {
  return (
    <article className="group np-card flex flex-col overflow-hidden">
      <Link href={article.path} className="flex h-full flex-col">
        <div className="overflow-hidden">
          <ArticleImage
            media={article.hero}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="aspect-[16/10] w-full transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          {article.category ? <CategoryLabel category={article.category} /> : null}
          <h3 className="line-clamp-3 text-[0.98rem] leading-snug font-bold text-ink group-hover:text-accent dark:group-hover:text-link">
            {article.title}
          </h3>
          {showExcerpt && article.excerpt ? (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted">{article.excerpt}</p>
          ) : null}
          <TimeMeta date={article.publishedAt} className="mt-auto pt-1" />
        </div>
      </Link>
    </article>
  );
}

/** Horizontal feature: big photo left, text right. */
export function FeatureCard({ article }: { article: ArticleSummary }) {
  return (
    <article className="group np-card overflow-hidden">
      <Link href={article.path} className="grid h-full sm:grid-cols-[1.15fr_1fr]">
        <div className="overflow-hidden">
          <ArticleImage
            media={article.hero}
            sizes="(min-width: 1024px) 33vw, 100vw"
            className="aspect-[16/10] h-full w-full transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </div>
        <div className="flex flex-col gap-3 p-5">
          {article.category ? <CategoryLabel category={article.category} /> : null}
          <h3 className="text-xl leading-snug font-extrabold text-ink group-hover:text-accent dark:group-hover:text-link">
            {article.title}
          </h3>
          {article.excerpt ? <p className="line-clamp-3 text-sm leading-relaxed text-muted">{article.excerpt}</p> : null}
          <TimeMeta date={article.publishedAt} className="mt-auto" />
        </div>
      </Link>
    </article>
  );
}

/** Compact row: small thumbnail and title. */
export function CompactCard({ article }: { article: ArticleSummary }) {
  return (
    <article className="group">
      <Link href={article.path} className="flex items-start gap-3 rounded-xl p-1.5 -m-1.5 hover:bg-surface-2">
        <ArticleImage media={article.hero} sizes="112px" className="aspect-[4/3] w-24 shrink-0 rounded-lg sm:w-28" />
        <div className="flex min-w-0 flex-col gap-1.5">
          {article.category ? <CategoryLabel category={article.category} /> : null}
          <h3 className="line-clamp-3 text-sm leading-snug font-bold text-ink group-hover:text-accent dark:group-hover:text-link">
            {article.title}
          </h3>
          <TimeMeta date={article.publishedAt} />
        </div>
      </Link>
    </article>
  );
}

/** Timeline row for the "Последни новини" list. */
export function TimelineItem({ article }: { article: ArticleSummary }) {
  return (
    <li className="group relative pl-16">
      <time dateTime={isoDate(article.publishedAt)} className="absolute top-0.5 left-0 text-xs font-bold text-muted tabular-nums">
        {formatClock(article.publishedAt)}
      </time>
      <span className="np-gradient-bg absolute top-1.5 left-12 size-2 rounded-full ring-4 ring-surface" aria-hidden="true" />
      <Link href={article.path} className="block">
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-ink group-hover:text-accent dark:group-hover:text-link">
          {article.title}
        </h3>
        {article.category ? <span className="mt-0.5 block text-xs text-muted">{article.category.name}</span> : null}
      </Link>
    </li>
  );
}
