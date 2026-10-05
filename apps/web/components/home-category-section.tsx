import { ArticleCard, CompactCard, FeatureCard, HeroCard } from "./article-card";
import { SectionTitle } from "./ui";
import type { ArticleSummary, CategoryRef } from "@/lib/queries";
import type { HomeShineAllocator } from "@/lib/home-shine";
import { shineDelayProp } from "@/lib/shine-style";
type Layout = "grid" | "feature";
function sectionCount(layout: Layout, wide: boolean) { return wide ? 7 : layout === "grid" ? 5 : 4; }
export function HomeCategorySection({
  category,
  articles,
  layout,
  wide,
  shine,
  idPrefix = "",
}: {
  category: CategoryRef;
  articles: ArticleSummary[];
  layout: Layout;
  wide: boolean;
  shine?: HomeShineAllocator;
  idPrefix?: string;
}) {
  const [first, ...rest] = articles;
  if (!first) return null;
  shine?.sectionBreak();
  // The mosaic needs every slot filled; with fewer stories the plain row avoids holes.
  const mosaic = articles.length >= sectionCount("grid", wide);
  // Two list columns only when both columns would be full.
  const twoLists = wide && rest.length >= 6;
  return (
    <section className="min-w-0" aria-labelledby={`${idPrefix}sec-${category.slug}`}>
      <SectionTitle id={`${idPrefix}sec-${category.slug}`} href={category.path} accentSlug={category.slug}>
        {category.name}
      </SectionTitle>
      {layout === "feature" ? (
        <div
          className={`grid gap-5 ${rest.length ? `lg:grid-cols-[1.6fr_1fr] ${twoLists ? "2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" : "3xl:grid-cols-[1.9fr_1fr]"}` : ""}`}
        >
          <FeatureCard article={first} {...shineDelayProp(shine?.nextCard())} />
          {rest.length ? (
            <div className={`np-card grid content-start gap-4 p-4 ${twoLists ? "2xl:grid-cols-2 2xl:gap-x-6" : ""}`}>
              {rest.map((article, index) => (
                <div key={article.id} className={index >= 3 ? (twoLists ? "hidden 2xl:block" : "hidden") : ""}>
                  <CompactCard article={article} {...shineDelayProp(shine?.nextCard())} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : !mosaic ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {articles.slice(0, 4).map((article) => (
            <ArticleCard key={article.id} article={article} {...shineDelayProp(shine?.nextCard())} />
          ))}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 ${wide ? "2xl:grid-cols-5" : ""}`}>
          <div className="contents 2xl:hidden">
            <ArticleCard article={first} {...shineDelayProp(shine?.nextCard())} />
          </div>
          <HeroCard
            article={first}
            size="tile"
            headingLevel="h3"
            className="hidden 2xl:col-span-2 2xl:row-span-2 2xl:block"
            {...shineDelayProp(shine?.nextCard())}
          />
          {rest.map((article, index) => (
            <div key={article.id} className={index >= 3 ? "hidden 2xl:contents" : "contents"}>
              <ArticleCard article={article} {...shineDelayProp(shine?.nextCard())} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

