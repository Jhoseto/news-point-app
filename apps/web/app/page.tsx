import { ArticleCard, CompactCard, FeatureCard, HeroCard } from "@/components/article-card";
import { HomeShineRoot } from "@/components/home-shine-root";
import { Fragment } from "react";
import { HomePoll } from "@/components/home-poll";
import { LeadingCarousel } from "@/components/leading-carousel";
import { LatestNews24h } from "@/components/latest-news-24h";
import { CompactList } from "@/components/lists";
import { BrandBanner, PlovdivBanner } from "@/components/site-chrome";
import { SectionTitle } from "@/components/ui";
import { createHomeShine, type HomeShineAllocator } from "@/lib/home-shine";
import { estimateHomeShineCycleSec } from "@/lib/home-shine-plan";
import { shineDelayProp } from "@/lib/shine-style";
import { loadPublicHome } from "@/lib/public-home";
import { type ArticleSummary, type CategoryRef } from "@/lib/queries";

export const revalidate = 60;

const FOCUS_LABEL = "na-fokus";
const FOCUS_ARCHIVE_PATH = "/na-fokus/";

type Layout = "grid" | "feature";

function sectionCount(layout: Layout, wide: boolean) {
  return wide ? 7 : layout === "grid" ? 5 : 4;
}

function CategorySection({
  category,
  articles,
  layout,
  wide,
  shine,
}: {
  category: CategoryRef;
  articles: ArticleSummary[];
  layout: Layout;
  wide: boolean;
  shine?: HomeShineAllocator;
}) {
  const [first, ...rest] = articles;
  if (!first) return null;
  shine?.sectionBreak();
  // The mosaic needs every slot filled; with fewer stories the plain row avoids holes.
  const mosaic = articles.length >= sectionCount("grid", wide);
  // Two list columns only when both columns would be full.
  const twoLists = wide && rest.length >= 6;
  return (
    <section className="min-w-0" aria-labelledby={`sec-${category.slug}`}>
      <SectionTitle id={`sec-${category.slug}`} href={category.path} accentSlug={category.slug}>
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

export default async function HomePage() {
  const { asOfMs, hero, support, latest, main: mainSections, aside: asideSections, focusCarousel, topicsCarousel, voiceCarousel, poll } = await loadPublicHome();

  const shine = createHomeShine();
  const bandHero = hero ? shine.nextCard() : undefined;
  const bandSupport0 = support[0] ? shine.nextCard() : undefined;
  const bandSupport1 = support[1] ? shine.nextCard() : undefined;
  const bandSupport2 = support[2] ? shine.nextCard() : undefined;
  shine.sectionBreak();
  const focusShineDelays = focusCarousel.map(() => shine.nextCard());
  const topicShineDelays = topicsCarousel.map(() => shine.nextCard());
  const voiceShineDelays = voiceCarousel.map(() => shine.nextCard());

  const narrowMain = mainSections.filter((section) => !section.wide);
  const wideMain = mainSections.filter((section) => section.wide);
  const shineCycleSec = estimateHomeShineCycleSec(
    shine,
    [...narrowMain, ...wideMain].map((section) => ({ ...section, layout: section.layout === "feature" ? "feature" as const : "grid" as const })),
    asideSections.map((section) => section.articles.length),
  );

  return (
    <HomeShineRoot cycleSec={shineCycleSec}>
      <div className="np-container flex flex-col gap-10 pt-6 pb-10 lg:pt-8 3xl:gap-12">
        <h1 className="sr-only">NewsPoint.bg – новини</h1>
        {/* Phone: lead, then a larger theme, two compact ones and the latest list. */}
        <div className="flex flex-col gap-4 lg:hidden">
          {hero ? <HeroCard article={hero} priority {...shineDelayProp(bandHero)} /> : null}
          {support[0] ? <HeroCard article={support[0]} size="tile" {...shineDelayProp(bandSupport0)} /> : null}
          {support.length > 1 ? (
            <div className="np-card flex flex-col gap-4 p-4">
              {support.slice(1).map((article, index) => (
                <CompactCard
                  key={article.id}
                  article={article}
                  {...shineDelayProp(index === 0 ? bandSupport1 : bandSupport2)}
                />
              ))}
            </div>
          ) : null}
          <LatestNews24h articles={latest} asOfMs={asOfMs} className="h-[30rem]" />
        </div>
        {/* Desktop: one band about half the viewport tall. The lead, three smaller themes
          and „Последни“ all start inside it, so nothing needs a scroll. */}
        <div className="hidden h-[min(56vh,34rem)] min-h-0 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_19rem] gap-4 lg:grid xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_21rem] 2xl:h-[min(54vh,36rem)] 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_23rem]">
          {hero ? <HeroCard article={hero} priority fit="band" className="min-h-0" {...shineDelayProp(bandHero)} /> : null}
          <div className="grid min-h-0 grid-rows-[1.35fr_1fr] gap-4">
            {support[0] ? (
              <HeroCard article={support[0]} size="tile" fit="band" headingLevel="h3" className="min-h-0" {...shineDelayProp(bandSupport0)} />
            ) : null}
            <div className="grid min-h-0 grid-cols-2 gap-4">
              {support.slice(1).map((article, index) => (
                <HeroCard
                  key={article.id}
                  article={article}
                  size="mini"
                  fit="band"
                  headingLevel="h3"
                  className="min-h-0"
                  {...shineDelayProp(index === 0 ? bandSupport1 : bandSupport2)}
                />
              ))}
            </div>
          </div>
          <LatestNews24h articles={latest} asOfMs={asOfMs} dense className="min-h-0" />
        </div>

        {focusCarousel.length ? (
          <div className="-mt-6 3xl:-mt-8">
            <LeadingCarousel
              articles={focusCarousel}
              shineDelays={focusShineDelays}
              href={FOCUS_ARCHIVE_PATH}
              accentSlug={FOCUS_LABEL}
            />
          </div>
        ) : null}
        {topicsCarousel.length ? (
          <LeadingCarousel articles={topicsCarousel} shineDelays={topicShineDelays} title="Топ теми" headingId="sec-top-themes" motion="to-right" />
        ) : null}

        {mainSections.map((section) => {
          if (section.category.slug === "balgariya") {
            return (
              <Fragment key={section.category.id}>
                {poll ? <HomePoll initial={poll} /> : null}
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6 2xl:grid-cols-[minmax(0,1fr)_24rem] 3xl:grid-cols-[minmax(0,1fr)_27rem] 3xl:gap-8">
                  <div className="flex h-full min-h-0 min-w-0 flex-col gap-10 3xl:gap-12">
                    <CategorySection category={section.category} articles={section.articles} layout="grid" wide={false} shine={shine} />
                    <PlovdivBanner />
                  </div>
                  <aside className="flex flex-col gap-6" aria-label="Още новини">
                    {asideSections.map((aside) => {
                      shine.sectionBreak();
                      return (
                        <CompactList
                          key={aside.category.id}
                          title={aside.category.name}
                          accentSlug={aside.category.slug}
                          articles={aside.articles}
                          href={aside.category.path}
                          shine={shine}
                        />
                      );
                    })}
                  </aside>
                </div>
                {voiceCarousel.length ? (
                  <LeadingCarousel
                    articles={voiceCarousel}
                    shineDelays={voiceShineDelays}
                    title="Гласът на истината"
                    headingId="sec-glasat-na-istinata"
                  />
                ) : null}
              </Fragment>
            );
          }
          if (!section.wide) return null;
          return (
            <CategorySection
              key={section.category.id}
              category={section.category}
              articles={section.articles}
              layout={section.layout === "feature" ? "feature" : "grid"}
              wide
              shine={shine}
            />
          );
        })}

        <BrandBanner />
      </div>
    </HomeShineRoot>
  );
}
