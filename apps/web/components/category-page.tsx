import { getByCategory, getLatest, getMenuCategories, type CategoryRef } from "@/lib/queries";
import { ArticleCard, FeatureCard } from "./article-card";
import { Breadcrumbs } from "./breadcrumbs";
import { CategoryChips, LatestList } from "./lists";
import { ArticleImage, SectionTitle } from "./ui";

const CATEGORY_LIMIT = 30;

export async function CategoryPage({ category }: { category: CategoryRef }) {
  const [articles, menu, latest] = await Promise.all([getByCategory(category.id, CATEGORY_LIMIT), getMenuCategories(), getLatest(8)]);
  const [lead, ...rest] = articles;
  const latestElsewhere = latest.filter((article) => !articles.some((own) => own.id === article.id)).slice(0, 6);

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pt-5 pb-10 sm:px-6">
      <Breadcrumbs items={[{ name: category.name, path: category.path }]} />

      <header className="relative isolate overflow-hidden rounded-3xl shadow-card">
        <ArticleImage media={lead?.hero ?? null} priority sizes="100vw" className="absolute inset-0 -z-10 h-full w-full" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020826]/90 via-[#020826]/60 to-[#020826]/20" aria-hidden="true" />
        <div className="flex min-h-44 flex-col justify-end gap-2 p-6 sm:min-h-56 sm:p-8">
          <span className="text-sm font-semibold text-white/75">Рубрика</span>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{category.name}</h1>
        </div>
      </header>

      <CategoryChips categories={menu} activeId={category.id} title="Други рубрики" />

      {articles.length === 0 ? (
        <p className="np-card p-6 text-body">Все още няма публикувани статии в тази рубрика.</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-6">
            {lead ? <FeatureCard article={lead} /> : null}
            {rest.length ? (
              <section aria-labelledby="sec-more">
                <SectionTitle id="sec-more">Още от {category.name}</SectionTitle>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {rest.map((article) => (
                    <ArticleCard key={article.id} article={article} showExcerpt />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
          <aside className="flex flex-col gap-6" aria-label="Последни новини">
            {latestElsewhere.length ? <LatestList articles={latestElsewhere} /> : null}
          </aside>
        </div>
      )}
    </div>
  );
}
