import { DesktopFeed } from "./desktop-feed";
import { MobileCanonicalFeed } from "./mobile-rubric-feed";
import { categoryMobileFeed } from "@/lib/mobile-rubric-feed-server";
import { loadPublicCategory } from "@/lib/public-category";
import { categoryCursorUrl, type CategoryCursor } from "@/lib/category-pagination";
import { CategoryArchiveNav } from "./category-archive-nav";
import type { CategoryRef } from "@/lib/queries";
import { ssrDesktopViewport } from "@/lib/ssr-viewport";
import { ArticleCard, FeatureCard } from "./article-card";
import { Breadcrumbs } from "./breadcrumbs";
import { CategoryChips } from "./lists";
import { LatestNews24h } from "./latest-news-24h";
import { ArticleImage, SectionTitle } from "./ui";
import { PlacementRefresh } from "./placement-refresh";
import { JsonLd } from "./json-ld";
import { collectionPage } from "@/lib/jsonld";
import { categorySeo } from "@/lib/public-metadata";
import { shareOrigin } from "@/lib/share-card";
import {
  CategoryArchivePageLink,
  CategoryArchiveScrollOnNavigate,
} from "./category-archive-pagination";

export async function CategoryPage({ category, cursor, canonicalPath }: { category: CategoryRef; cursor: CategoryCursor | null; canonicalPath?: string }) {
  const [view, ssrDesktop] = await Promise.all([loadPublicCategory(category, cursor), ssrDesktopViewport()]);
  const asOfMs = view.asOfMs;
  const archive = view.archive;
  const latest24h = view.latest24h;
  const menu = view.menu;
  const articles = view.articles;
  const [lead, ...rest] = articles;
  const seo = categorySeo(category);
  const categoryLd = cursor ? null : collectionPage({
    origin: shareOrigin(),
    path: category.path,
    title: category.name,
    description: seo.description,
    items: articles.map((article) => ({ path: article.path, title: article.title })),
  });
  const mobileModel = categoryMobileFeed(
    category,
    view,
    cursor,
    canonicalPath ?? (cursor ? categoryCursorUrl(category.path, cursor) : category.path),
  );

  if (!ssrDesktop) {
    return (
      <>
        {categoryLd ? <JsonLd data={categoryLd} id="np-ld-category" /> : null}
        <CategoryArchiveScrollOnNavigate />
        <PlacementRefresh nextChangeAt={view.nextChangeAt} />
        <MobileCanonicalFeed ssrDesktop={false} model={mobileModel} />
      </>
    );
  }

  return (
    <>
      {categoryLd ? <JsonLd data={categoryLd} id="np-ld-category" /> : null}
      <DesktopFeed ssrDesktop>
        <CategoryArchiveScrollOnNavigate />
        <PlacementRefresh nextChangeAt={view.nextChangeAt} />
        <div data-np-category-archive className="np-mobile-legacy-feed np-container flex flex-col gap-4 pt-3 pb-10 lg:gap-8 lg:pt-5">
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
              <CategoryArchivePageLink href={category.path} prefetch={false} className="font-bold text-accent hover:underline">Към най-новите</CategoryArchivePageLink>
            </div>
          ) : null}

          <div data-np-latest-frame className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_clamp(24rem,28vw,28rem)] xl:gap-6 2xl:grid-cols-[minmax(0,1fr)_clamp(28rem,24vw,34rem)] 2xl:gap-[clamp(1.25rem,1.6vw,2.25rem)] 3xl:grid-cols-[minmax(0,1fr)_clamp(30rem,22vw,38rem)]">
            <div data-np-latest-stage className="flex min-w-0 flex-col gap-6">
              {articles.length === 0 ? (
                <p className="np-card p-6 text-body">{archive.anchored ? "На тази страница вече няма достъпни публикации. Върнете се към най-новите новини в рубриката." : "Все още няма публикувани статии в тази рубрика."}</p>
              ) : (
                <>
                  {/* Desktop: original FeatureCard + grid layout. */}
                  <div id="np-rubric-cards" className="scroll-mt-[var(--np-header-h)] hidden lg:flex lg:flex-col lg:gap-6">
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
                  {view.pagination.totalPages > 1 || archive.previous || archive.next ? (
                    <CategoryArchiveNav
                      categoryName={category.name}
                      strip={view.pageStrip}
                      currentPage={view.pagination.currentPage}
                      totalPages={view.pagination.totalPages}
                      firstHref={view.pagination.firstHref}
                      lastHref={view.pagination.lastPageHref}
                      previous={archive.previous}
                      next={archive.next}
                    />
                  ) : null}
                </>
              )}
            </div>
            <LatestNews24h articles={latest24h} asOfMs={asOfMs} dense liveRefresh size="rail" className="max-xl:hidden" />
          </div>
        </div>
      </DesktopFeed>
    </>
  );
}
