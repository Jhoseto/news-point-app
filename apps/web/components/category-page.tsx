import Link from "next/link";
import { unstable_cache } from "next/cache";
import { CATEGORY_PAGE_SIZE, type CategoryCursor } from "@/lib/category-pagination";
import { categoryFront } from "@/lib/front-page";
import { getCategoryArchive, getLatest24Hours, getMenuCategories, publicAsOfMs, type ArticleSummary, type CategoryRef } from "@/lib/queries";
import { ArticleCard, FeatureCard } from "./article-card";
import { Breadcrumbs } from "./breadcrumbs";
import { CategoryChips } from "./lists";
import { LatestNews24h } from "./latest-news-24h";
import { MobileHorizonCard, MobileLeadCard, MobileSupportingCard } from "./mobile-home-cards";
import { ArticleImage, SectionTitle } from "./ui";
import { ArrowRightIcon } from "./icons";

function reviveArticle(article: ArticleSummary): ArticleSummary {
  return article.publishedAt instanceof Date ? article : { ...article, publishedAt: new Date(article.publishedAt) };
}

const readCategoryView = unstable_cache(async (category: CategoryRef, cursor: CategoryCursor | null) => {
  const asOfMs = publicAsOfMs();
  const front = await categoryFront(category.id, asOfMs);
  const skipIds = cursor ? front.pinnedIds : [...front.pinnedIds, ...front.excludedIds];
  const [archive, menu, latest24h] = await Promise.all([
    getCategoryArchive(category, cursor, cursor ? { skipIds } : { skipIds, limit: Math.max(1, CATEGORY_PAGE_SIZE - front.pins.length) }),
    getMenuCategories(),
    getLatest24Hours(asOfMs),
  ]);
  return { asOfMs, front, archive, menu, latest24h };
}, ["public-category-view"], { revalidate: 60 });

export async function CategoryPage({ category, cursor }: { category: CategoryRef; cursor: CategoryCursor | null }) {
  const view = await readCategoryView(category, cursor);
  const asOfMs = view.asOfMs;
  const archive = { ...view.archive, articles: view.archive.articles.map(reviveArticle) };
  const latest24h = view.latest24h.map(reviveArticle);
  const menu = view.menu;
  const pins = view.front.pins.map(reviveArticle);
  const articles = cursor ? archive.articles : [...pins, ...archive.articles].slice(0, CATEGORY_PAGE_SIZE);
  const [lead, ...rest] = articles;

  return (
    <div data-np-category-archive className="np-container flex flex-col gap-4 pt-3 pb-10 lg:gap-8 lg:pt-5">
      <div className="flex flex-col gap-1.5 lg:hidden">
        <Breadcrumbs items={[]} dense />
        <div className="[&_.np-section-heading]:mb-0 [&_.np-ring]:!size-4 [&_h1]:text-base [&_h1]:leading-tight">
          <SectionTitle as="h1" accentSlug={category.slug}>
            {category.name}
          </SectionTitle>
        </div>
        <CategoryChips categories={menu} activeId={category.id} title="Други рубрики" dense />
      </div>

      <div className="hidden lg:contents">
        <Breadcrumbs items={[{ name: category.name, path: category.path }]} />
      </div>

      <header className="relative isolate hidden overflow-hidden rounded-3xl shadow-card lg:block">
        <ArticleImage media={lead?.hero ?? null} priority sizes="100vw" className="absolute inset-0 -z-10 h-full w-full object-[center_30%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020826]/90 via-[#020826]/60 to-[#020826]/20" aria-hidden="true" />
        <div className="flex min-h-56 flex-col justify-end gap-2 p-8">
          <span className="text-sm font-semibold text-white/75">Рубрика</span>
          <h1 className="text-5xl font-extrabold tracking-tight text-white">{category.name}</h1>
        </div>
      </header>

      <div className="hidden lg:block">
        <CategoryChips categories={menu} activeId={category.id} title="Други рубрики" />
      </div>

      {archive.anchored ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span>Разглеждате по-ранни публикации</span>
          <Link href={category.path} prefetch={false} className="font-bold text-accent hover:underline">Към най-новите</Link>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6 2xl:grid-cols-[minmax(0,1fr)_24rem] 3xl:grid-cols-[minmax(0,1fr)_27rem] 3xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          {articles.length === 0 ? (
            <p className="np-card p-6 text-body">{archive.anchored ? "На тази страница вече няма достъпни публикации. Върнете се към най-новите новини в рубриката." : "Все още няма публикувани статии в тази рубрика."}</p>
          ) : (
            <>
            {/* Phone: lead → two medium cards → elongated photo cards. No title-only list. */}
            <div className="flex flex-col gap-4 lg:hidden">
              {lead ? <MobileLeadCard article={lead} priority /> : null}
              {articles[1] ? <MobileSupportingCard article={articles[1]} /> : null}
              {articles[2] ? <MobileSupportingCard article={articles[2]} /> : null}
              {articles.slice(3).map((article) => (
                <MobileHorizonCard key={article.id} article={article} />
              ))}
            </div>
            {/* Desktop: original FeatureCard + grid layout. */}
            <div className="hidden lg:flex lg:flex-col lg:gap-6">
              {lead ? <FeatureCard article={lead} /> : null}
              {rest.length ? (
                <section aria-labelledby="sec-more">
                  <SectionTitle id="sec-more">Още от {category.name}</SectionTitle>
                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
                    {rest.map((article) => (
                      <ArticleCard key={article.id} article={article} showExcerpt />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
            {archive.previous || archive.next ? (
              <nav aria-label={`Страници на рубрика ${category.name}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                {archive.previous ? (
                  <Link href={archive.previous} prefetch={false} rel="prev" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-surface-2">
                    <ArrowRightIcon className="rotate-180" /> Назад
                  </Link>
                ) : <span />}
                {archive.next ? (
                  <Link href={archive.next} prefetch={false} rel="next" className="np-gradient-bg inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-on-accent shadow-card transition hover:brightness-110">
                    Още новини <ArrowRightIcon />
                  </Link>
                ) : <span className="text-sm text-muted">Стигнахте края на наличния архив</span>}
              </nav>
            ) : null}
            </>
          )}
        </div>
        <LatestNews24h articles={latest24h} asOfMs={asOfMs} dense liveRefresh className="np-latest-viewport hidden lg:block" />
      </div>
    </div>
  );
}
