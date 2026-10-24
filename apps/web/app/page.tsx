import { DesktopFeed } from "@/components/desktop-feed";
import { publicPageMetadata } from "@/lib/public-metadata";
import { HeroCard } from "@/components/article-card";
import { HomeCategorySection as CategorySection } from "@/components/home-category-section";
import { MobileCanonicalFeed } from "@/components/mobile-rubric-feed";
import { homeMobileFeed } from "@/lib/mobile-rubric-feed-server";
import { getMenuCategories } from "@/lib/queries";
import { HomeShineRoot } from "@/components/home-shine-root";
import { Fragment } from "react";
import dynamic from "next/dynamic";
import { carouselArticle } from "@/lib/carousel-article";

const LeadingCarousel = dynamic(() => import("@/components/leading-carousel").then((module) => module.LeadingCarousel));
const HomePoll = dynamic(() => import("@/components/home-poll").then((module) => module.HomePoll));
import { DeferredPlacementRefresh } from "@/components/deferred-placement-refresh";
import { LatestNews24h } from "@/components/latest-news-24h";
import { CompactList } from "@/components/lists";
import { PlovdivBanner } from "@/components/site-chrome";
import { createHomeShine, type HomeShineAllocator } from "@/lib/home-shine";
import { estimateHomeShineCycleSec } from "@/lib/home-shine-plan";
import { shineDelayProp } from "@/lib/shine-style";
import type { ComposedSection } from "@/lib/home-compose";
import { loadPublicHome } from "@/lib/public-home";
import { HOME_ANALYSES_RUBRIC_SLUG, HOME_FOCUS_RUBRIC_SLUG, HOME_VOICE_RUBRIC_SLUG } from "@newspoint/content";
import { type ArticleSummary, type CategoryRef } from "@/lib/queries";
import { ssrDesktopViewport } from "@/lib/ssr-viewport";

export const revalidate = 60;
export const metadata = publicPageMetadata("home");

const FOCUS_ARCHIVE_PATH = `/${HOME_FOCUS_RUBRIC_SLUG}/`;

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
  const [home, menu, ssrDesktop] = await Promise.all([loadPublicHome(), getMenuCategories(), ssrDesktopViewport()]);
  const mobile = homeMobileFeed(home, menu);
  const { asOfMs, hero, support, latest, main: mainSections, aside: asideSections, focusCarousel, topicsCarousel, voiceCarousel, poll } = home;

  const shine = createHomeShine();
  const bandHero = hero ? shine.nextCard() : undefined;
  const bandSupport0 = support[0] ? shine.nextCard() : undefined;
  const bandSupport1 = support[1] ? shine.nextCard() : undefined;
  const bandSupport2 = support[2] ? shine.nextCard() : undefined;
  shine.sectionBreak();
  const focusShineDelays = focusCarousel.map(() => shine.nextCard());
  const analysesShineDelays = topicsCarousel.map(() => shine.nextCard());
  const voiceShineDelays = voiceCarousel.map(() => shine.nextCard());

  const narrowMain = mainSections.filter((section) => !section.wide);
  const wideMain = mainSections.filter((section) => section.wide);
  const shineSections = [
    ...narrowMain,
    ...wideMain,
  ];
  const shineCycleSec = estimateHomeShineCycleSec(
    shine,
    shineSections,
    asideSections.map((section) => section.articles.length),
  );

  // Render exactly one shell in the RSC payload. Passing the other tree as
  // children of a client gate still serializes it into the HTML (~3 MB before).
  if (!ssrDesktop) {
    return <><DeferredPlacementRefresh nextChangeAt={home.nextChangeAt} /><MobileCanonicalFeed model={mobile} ssrDesktop={false} /></>;
  }

  return (
    <DesktopFeed ssrDesktop>
    <DeferredPlacementRefresh nextChangeAt={home.nextChangeAt} />
    <HomeShineRoot cycleSec={shineCycleSec} mobileHidden>
      <div className="np-container flex flex-col gap-10 pt-6 pb-10 lg:pt-8 3xl:gap-12">
        <h1 className="sr-only">NewsPoint.bg – новини от Пловдив, България и света</h1>
        {/* Desktop: one band about half the viewport tall. The lead, three smaller themes
          and „Последни“ all start inside it, so nothing needs a scroll. */}
        <div data-np-latest-frame className="hidden h-[min(64vh,32rem)] min-h-0 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 lg:grid xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_18rem] 2xl:h-[min(56vh,34rem)] 2xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_21rem] 3xl:h-[min(54vh,36rem)] 3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_23rem]">
          {hero ? <HeroCard article={hero} priority fit="band" className="min-h-0" {...shineDelayProp(bandHero)} /> : null}
          <div data-np-latest-stage className="grid min-h-0 grid-rows-[1fr_1.25fr] gap-3 2xl:grid-rows-[1.35fr_1fr] 2xl:gap-4">
            {support[0] ? (
              <HeroCard article={support[0]} size="tile" fit="band" headingLevel="h3" className="min-h-0" {...shineDelayProp(bandSupport0)} />
            ) : null}
            <div className="grid min-h-0 grid-cols-1 gap-3 2xl:grid-cols-2 2xl:gap-4">
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
          <LatestNews24h articles={latest} asOfMs={asOfMs} dense size="band" className="max-xl:hidden" />
        </div>

        {focusCarousel.length ? (
          <div className="-mt-6 3xl:-mt-8">
            <LeadingCarousel
              articles={focusCarousel.map(carouselArticle)}
              shineDelays={focusShineDelays}
              href={FOCUS_ARCHIVE_PATH}
              accentSlug={HOME_FOCUS_RUBRIC_SLUG}
            />
          </div>
        ) : null}
        {topicsCarousel.length ? (
          <LeadingCarousel
            articles={topicsCarousel.map(carouselArticle)}
            shineDelays={analysesShineDelays}
            title="Анализи и коментари"
            headingId="sec-analizi-komentari"
            motion="to-right"
            href={`/${HOME_ANALYSES_RUBRIC_SLUG}/`}
            accentSlug={HOME_ANALYSES_RUBRIC_SLUG}
          />
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
                {voiceCarousel.length ? (
                  <LeadingCarousel
                    articles={voiceCarousel.map(carouselArticle)}
                    shineDelays={voiceShineDelays}
                    title="Гласът на истината"
                    headingId="sec-glasat-na-istinata"
                    href={`/${HOME_VOICE_RUBRIC_SLUG}/`}
                    accentSlug={HOME_VOICE_RUBRIC_SLUG}
                  />
                ) : null}
              </Fragment>
            );
          }
          if (!section.wide || section.category.slug === HOME_VOICE_RUBRIC_SLUG) return null;
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

      </div>
    </HomeShineRoot>
    </DesktopFeed>
  );
}
