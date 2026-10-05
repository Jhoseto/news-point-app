import { DesktopFeed } from "@/components/desktop-feed";
import { HeroCard } from "@/components/article-card";
import { HomeCategorySection as CategorySection } from "@/components/home-category-section";
import { MobileCanonicalFeed } from "@/components/mobile-rubric-feed";
import { homeMobileFeed } from "@/lib/mobile-rubric-feed-server";
import { getMenuCategories } from "@/lib/queries";
import { HomeShineRoot } from "@/components/home-shine-root";
import { Fragment } from "react";
import { HomePoll } from "@/components/home-poll";
import { LeadingCarousel } from "@/components/leading-carousel";
import { LatestNews24h } from "@/components/latest-news-24h";
import { CompactList } from "@/components/lists";
import { BrandBanner, PlovdivBanner } from "@/components/site-chrome";
import { createHomeShine, type HomeShineAllocator } from "@/lib/home-shine";
import { estimateHomeShineCycleSec } from "@/lib/home-shine-plan";
import { shineDelayProp } from "@/lib/shine-style";
import type { ComposedSection } from "@/lib/home-compose";
import { loadPublicHome } from "@/lib/public-home";
import { type ArticleSummary, type CategoryRef } from "@/lib/queries";

export const revalidate = 60;

const FOCUS_LABEL = "na-fokus";
const FOCUS_ARCHIVE_PATH = "/na-fokus/";
/** Rubric grid is omitted; homepage uses the editorial carousel only. */
const VOICE_SECTION_SLUG = "glasat-na-istinata";

function HomeAsideLists({
  sections,
  className,
  shine,
}: {
  sections: ComposedSection[];
  className: string;
  shine?: HomeShineAllocator;
}) {
  if (!sections.length) return null;
  return (
    <aside className={className} aria-label="Още новини">
      {sections.map((aside) => {
        shine?.sectionBreak();
        return (
          <CompactList
            key={aside.category.id}
            title={aside.category.name}
            accentSlug={aside.category.slug}
            articles={aside.articles}
            href={aside.category.path}
            {...(shine ? { shine } : {})}
          />
        );
      })}
    </aside>
  );
}


export default async function HomePage() {
  const home = await loadPublicHome();
  const menu = await getMenuCategories();
  const mobile = homeMobileFeed(home, menu);
  const { asOfMs, hero, support, latest, main: mainSections, aside: asideSections, focusCarousel, topicsCarousel, voiceCarousel, poll } = home;

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
    <>
    <MobileCanonicalFeed model={mobile} />
    <DesktopFeed>
    <HomeShineRoot cycleSec={shineCycleSec} mobileHidden>
      <div className="np-container flex flex-col gap-10 pt-6 pb-10 lg:pt-8 3xl:gap-12">
        <h1 className="sr-only">NewsPoint.bg – новини</h1>
        {/* Desktop: one band about half the viewport tall. The lead, three smaller themes
          and „Последни“ all start inside it, so nothing needs a scroll. */}
        <div data-np-latest-frame className="hidden h-[min(calc(56*var(--np-desktop-vh,1vh)),34rem)] min-h-0 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_19rem] gap-4 lg:grid xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_21rem] 2xl:h-[min(calc(54*var(--np-desktop-vh,1vh)),36rem)] 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_23rem]">
          {hero ? <HeroCard article={hero} priority fit="band" className="min-h-0" {...shineDelayProp(bandHero)} /> : null}
          <div data-np-latest-stage className="grid min-h-0 grid-rows-[1.35fr_1fr] gap-4">
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
          <LatestNews24h articles={latest} asOfMs={asOfMs} dense size="band" />
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
                  <HomeAsideLists sections={asideSections} shine={shine} className="hidden flex-col gap-6 lg:flex" />
                </div>
              </Fragment>
            );
          }
          if (!section.wide || section.category.slug === VOICE_SECTION_SLUG) return null;
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

        <HomeAsideLists sections={asideSections} className="flex flex-col gap-6 lg:hidden" />
        {voiceCarousel.length ? (
          <LeadingCarousel
            articles={voiceCarousel}
            shineDelays={voiceShineDelays}
            title="Гласът на истината"
            headingId="sec-glasat-na-istinata"
          />
        ) : null}

        <BrandBanner />
      </div>
    </HomeShineRoot>
    </DesktopFeed>
    </>
  );
}
