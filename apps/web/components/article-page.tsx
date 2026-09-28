import Link from "next/link";
import { formatFull, isoDate, readingMinutes } from "@/lib/format";
import { getArticleNeighbors, getLatest, getRelated, type ArticleDetail } from "@/lib/queries";
import { ArticleBody } from "./article-body";
import { Breadcrumbs } from "./breadcrumbs";
import { BookIcon, ClockIcon, ExternalIcon } from "./icons";
import { CategoryChips, CompactList, LatestList } from "./lists";
import { ShareButtons } from "./share";
import { ReadingProgress } from "./reading-progress";
import { ArticleImage, CategoryPill } from "./ui";

export async function ArticlePage({ article }: { article: ArticleDetail }) {
  const [latest, related, neighbors] = await Promise.all([getLatest(7), getRelated(article, 4), getArticleNeighbors(article)]);
  const latestOthers = latest.filter((item) => item.id !== article.id).slice(0, 6);
  const shareUrl = article.sourceUrl ?? article.path;
  const crumbs = article.category
    ? [{ name: article.category.name, path: article.category.path }, { name: article.title }]
    : [{ name: article.title }];

  return (
    <div className="np-container flex max-w-[104rem] flex-col gap-6 pt-5 pb-10">
      <ReadingProgress />
      <Breadcrumbs items={crumbs} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6 2xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:gap-10">
        <article className="min-w-0">
          {article.hero ? (
            <>
              <div className="relative overflow-hidden rounded-3xl shadow-card">
                <ArticleImage media={article.hero} priority sizes="(min-width: 1536px) 70vw, (min-width: 1024px) 66vw, 100vw" className="aspect-[16/9] w-full" />
                {article.category ? <CategoryPill category={article.category} className="absolute top-4 left-4" /> : null}
              </div>
              {article.hero.caption || article.hero.credit ? (
                <p className="mt-2 text-xs text-muted">
                  {article.hero.caption}{article.hero.caption && article.hero.credit ? " · " : ""}
                  {article.hero.credit ? `Снимка: ${article.hero.credit}` : ""}
                </p>
              ) : null}
            </>
          ) : null}

          <div className={`mx-auto flex max-w-[46rem] flex-col gap-5 ${article.hero ? "mt-6" : "mt-2"}`}>
            {!article.hero && article.category ? <CategoryPill category={article.category} glass={false} className="self-start" /> : null}
            <h1 className="text-3xl leading-[1.15] font-extrabold tracking-tight text-balance text-ink sm:text-4xl lg:text-[2.6rem]">
              {article.title}
            </h1>
            {article.excerpt ? <p className="text-lg leading-relaxed text-body">{article.excerpt}</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-4 border-y border-line py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-muted">
                <span className="inline-flex items-center gap-2 font-bold text-ink">
                  <span className="np-ring !size-5" aria-hidden="true" />
                  {article.authorName}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ClockIcon width={14} height={14} />
                  <time dateTime={isoDate(article.publishedAt)}>{formatFull(article.publishedAt)}</time>
                </span>
                <span className="inline-flex items-center gap-1">
                  <BookIcon width={14} height={14} />
                  {readingMinutes(article.body)} мин. четене
                </span>
              </div>
              <ShareButtons url={shareUrl} title={article.title} />
            </div>

            <div id="np-article-body"><ArticleBody blocks={article.body} media={article.media} /></div>

            {article.categories.length ? (
              <div className="mt-4 flex flex-col gap-3 border-t border-line pt-5">
                <span className="text-sm font-bold text-ink">Рубрики</span>
                <CategoryChips categories={article.categories} activeId={article.category?.id} title="Рубрики на статията" />
              </div>
            ) : null}

            {article.sourceUrl ? (
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 self-start text-xs font-semibold text-muted hover:text-ink"
              >
                Оригинална публикация на newspoint.bg
                <ExternalIcon width={13} height={13} />
              </a>
            ) : null}

            {neighbors.older || neighbors.newer ? (
              <nav aria-label="Съседни статии" className="mt-4 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
                {neighbors.older ? (
                  <Link href={neighbors.older.path} rel="prev" className="np-card group flex min-h-24 flex-col gap-2 p-4 transition hover:-translate-y-0.5 hover:shadow-card">
                    <span className="text-xs font-bold text-muted">← По-ранна в {article.category?.name}</span>
                    <span className="line-clamp-2 text-sm font-extrabold text-ink group-hover:text-accent">{neighbors.older.title}</span>
                  </Link>
                ) : <span />}
                {neighbors.newer ? (
                  <Link href={neighbors.newer.path} rel="next" className="np-card group flex min-h-24 flex-col gap-2 p-4 transition hover:-translate-y-0.5 hover:shadow-card sm:text-right">
                    <span className="text-xs font-bold text-muted">По-нова в {article.category?.name} →</span>
                    <span className="line-clamp-2 text-sm font-extrabold text-ink group-hover:text-accent">{neighbors.newer.title}</span>
                  </Link>
                ) : <span />}
              </nav>
            ) : null}
          </div>
        </article>

        <aside className="flex flex-col gap-6" aria-label="Още новини">
          <LatestList articles={latestOthers} />
          <CompactList title="Свързани статии" articles={related} {...(article.category ? { href: article.category.path } : {})} />
        </aside>
      </div>
    </div>
  );
}
