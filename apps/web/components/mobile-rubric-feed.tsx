import Link from "next/link";
import { CategoryArchivePageLink } from "./category-archive-pagination";
import { CategoryArchiveNav } from "./category-archive-nav";
import dynamic from "next/dynamic";
import { Fragment, Suspense } from "react";
import { preload } from "react-dom";
import { MobileFeedBoundary } from "./mobile-feed-boundary";
import type { MobileRubricFeed as Feed, MobileFeedContent, MobileHomeMainSection } from "@/lib/mobile-rubric-feed";
import { HOME_LEAD_SECTION } from "@newspoint/content/arrangement";
import { reviveFeedArticle } from "@/lib/mobile-rubric-feed";
import { articleImageAttrs } from "@/lib/article-image";
import { MobileCompactRow, MobileHorizonCard, MobileLeadCard, MobileSmallPair, MobileSupportingCard } from "./mobile-home-cards";
import { CompactList } from "./lists";
import { HomeCategorySection } from "./home-category-section";
import { HomePodcastLink } from "./home-podcast-link";
import { SectionTitle } from "./ui";
import { Breadcrumbs } from "./breadcrumbs";
import { LATEST_CAROUSEL_SPEED } from "@/lib/carousel-autoplay";
import { carouselArticle } from "@/lib/carousel-article";

const LeadingCarousel = dynamic(() => import("./leading-carousel").then((m) => m.LeadingCarousel));
const HomePoll = dynamic(() => import("./home-poll").then((m) => m.HomePoll));
const MOBILE_HOME_CAROUSEL_SPEED = 20;
// Canonical home tails get one boundary so pending widgets do not hold the
// first screen or reveal incomplete geometry between already-visible sections.

/** Start the mobile LCP image fetch in parallel with HTML/CSS (same attrs as ArticleImage). */
function preloadLeadHero(hero: ReturnType<typeof reviveFeedArticle>["hero"], enabled: boolean) {
  if (!enabled || !hero) return;
  const attrs = articleImageAttrs(hero, { priority: true, sizes: "100vw" });
  preload(attrs.src, {
    as: "image",
    fetchPriority: "high",
    ...(attrs.srcSet ? { imageSrcSet: attrs.srcSet } : {}),
    imageSizes: "100vw",
  });
}

export type PreviewWindow = Record<string, { top: number; left: number; width: number; height?: number; carousel?: { index: number; offset: number } }>;
function Block({ id, window, children, preserveHeight = false }: { id: string; window?: PreviewWindow; children: React.ReactNode; preserveHeight?: boolean }) {
  const box = window?.[id];
  if (window && !box) return null;
  return <div className={window ? undefined : "contents"} data-mobile-preview-block={id} {...(box ? { style: { position: "absolute" as const, top: box.top, left: box.left, width: box.width, ...(preserveHeight && box.height !== undefined ? { height: box.height } : {}) } } : {})}>{children}</div>;
}
const anchor = (id: string, child: React.ReactNode, window?: PreviewWindow, preserveHeight = false) => <Block key={id} id={id} preserveHeight={preserveHeight} {...(window ? { window } : {})}><div className="contents" data-mobile-feed-anchor={id}>{child}</div></Block>;
export function MobileHomeFeed({ feed, preview = false, namespace = "mobile-home", window, now = new Date() }: { feed: Extract<MobileFeedContent, { kind: "home" }>; preview?: boolean; namespace?: string; window?: PreviewWindow; now?: Date }) {
  const hero = feed.hero ? reviveFeedArticle(feed.hero) : null;
  preloadLeadHero(hero?.hero ?? null, !preview && !window);
  const support = feed.support.map(reviveFeedArticle);
  const plovdivSection = feed.main.find((section) => section.category.slug === HOME_LEAD_SECTION);
  const mainAfterPlovdiv = feed.main.filter((section) => section.category.slug !== HOME_LEAD_SECTION);
  const carousel = (articles: typeof feed.focusCarousel, props: { title?: string; href?: string; accentSlug?: string; motion?: "to-left" | "to-right"; compactCards?: boolean; exactTime?: boolean; speed?: number }, id: string) => {
    const position = window?.[id]?.carousel;
    const rotated = position ? [...articles.slice(position.index), ...articles.slice(0, position.index)] : articles;
    return articles.length ? <Block id={id} {...(window ? { window } : {})}><div data-mobile-pager-ignore data-mobile-feed-anchor={id}><LeadingCarousel articles={(preview ? rotated.slice(0, 4) : articles).map(article => carouselArticle(reviveFeedArticle(article)))} mobileOnly preview={preview} previewOffset={position?.offset ?? 0} headingId={`${namespace}-${id}`} speed={MOBILE_HOME_CAROUSEL_SPEED} {...props} /></div></Block> : null;
  };
  const renderMainSection = (section: MobileHomeMainSection) => {
    if (section.category.slug !== "balgariya" && !section.wide) return null;
    return (
      <Fragment key={section.category.id}>
        {section.category.slug === "balgariya" && feed.poll ? (
          <Block id="poll" {...(window ? { window } : {})}>
            <div data-mobile-pager-ignore data-mobile-feed-anchor="poll">
              <HomePoll initial={feed.poll} mobileOnly preview={preview} namespace={namespace} />
            </div>
          </Block>
        ) : null}
        <Block id={`section-${section.category.id}`} {...(window ? { window } : {})}>
          <div data-mobile-feed-anchor={`section-${section.category.id}`}>
            <HomeCategorySection
              category={section.category}
              articles={section.articles.map(reviveFeedArticle)}
              layout={section.category.slug === "balgariya" ? "grid" : section.layout === "feature" ? "feature" : "grid"}
              wide={section.category.slug !== "balgariya"}
              idPrefix={`${namespace}-`}
              showLeadExcerpt={false}
              mobileOnly
            />
          </div>
        </Block>
      </Fragment>
    );
  };
  const tail = <>
    <div className="np-mobile-home-pre-focus flex flex-col gap-4">
      {feed.latestCarousel.length ? carousel(feed.latestCarousel, { title: "Последни новини", motion: "to-left", compactCards: true, exactTime: true, speed: LATEST_CAROUSEL_SPEED }, "latest") : null}
      {feed.focusCarousel.length ? carousel(feed.focusCarousel, { href: "/na-fokus/", accentSlug: "na-fokus", title: "На Фокус" }, "focus") : null}
    </div>
    {plovdivSection ? renderMainSection(plovdivSection) : null}
    {carousel(feed.localPoliticsCarousel ?? [], { title: "Местна политика", href: "/mestna-politika/", accentSlug: "mestna-politika", motion: "to-left" }, "local-politics")}
    {carousel(feed.topicsCarousel, { title: "Анализи и коментари", href: "/ot-soczialnite-mrezhi/", accentSlug: "ot-soczialnite-mrezhi", motion: "to-left", speed: 18 }, "topics")}
    {feed.latestPodcast ? anchor("latest-podcast", <HomePodcastLink episode={feed.latestPodcast} />, window) : null}
    {mainAfterPlovdiv.map((section) => (
      <Fragment key={section.category.id}>
        {renderMainSection(section)}
        {section.category.slug === "balgariya"
          ? carousel(feed.voiceCarousel, { title: "Гласът на истината", href: "/glasat-na-istinata/", accentSlug: "glasat-na-istinata" }, "voice")
          : null}
      </Fragment>
    ))}
    {feed.aside.length ? <aside className="flex flex-col gap-6" aria-label="Още новини">{feed.aside.map(section => <Block key={section.category.id} id={`section-${section.category.id}`} {...(window ? { window } : {})}><div data-mobile-feed-anchor={`section-${section.category.id}`}><CompactList title={section.category.name} accentSlug={section.category.slug} href={section.category.path} articles={section.articles.map(reviveFeedArticle)} /></div></Block>)}</aside> : null}
  </>;
  return <div className={`np-mobile-home np-container flex flex-col gap-10 pt-6 pb-10${window ? " relative" : ""}`}>
    <h1 tabIndex={-1} data-mobile-feed-heading className="sr-only">NewsPoint.bg – новини от Пловдив, България и света</h1>
    <div className={`np-mobile-home-top flex flex-col gap-5${hero && support.length === 3 ? " np-mobile-home-top--four" : ""}`}>
      {hero ? anchor(hero.id, <MobileLeadCard article={hero} overlay priority={!preview && !window} now={now} />, window, true) : null}
      {support[0] ? anchor(support[0].id, <MobileSupportingCard article={support[0]} featured now={now} />, window) : null}
      {support[1] && support[2] ? anchor(support[1].id, <MobileSmallPair left={support[1]} right={support[2]} now={now} />, window) : null}
      {support.length > 3 ? <Block id="support-rows" {...(window ? { window } : {})}><div className="np-card flex flex-col divide-y divide-line overflow-hidden">{support.slice(3).map(article => anchor(article.id, <MobileCompactRow article={article} now={now} />))}</div></Block> : null}
      {!hero && !support.length ? <Block id="empty" {...(window ? { window } : {})}><p className="np-card p-6 text-body">Все още няма публикувани новини.</p></Block> : null}
    </div>
    {preview || window ? tail : <Suspense fallback={<div data-mobile-feed-pending style={{ minHeight: "100svh" }} role="status" aria-label="Зареждане на новините"><span className="sr-only">Зареждане на новините…</span></div>}>{tail}</Suspense>}
  </div>;
}
export function MobileCategoryFeed({ feed, preview = false, window, now = new Date() }: { feed: Extract<MobileFeedContent, { kind: "category" }>; preview?: boolean; window?: PreviewWindow; now?: Date }) {
  const articles = feed.articles.map(reviveFeedArticle);
  preloadLeadHero(articles[0]?.hero ?? null, !preview && !window);
  return <div data-np-category-archive className={`np-container flex flex-col gap-4 pt-3 pb-10${window ? " relative" : ""}`}>
    <Block id="category-heading" {...(window ? { window } : {})}><div className="flex flex-col gap-1.5">
      <Breadcrumbs items={[]} dense />
      <div className="[&_.np-section-heading]:mb-0 [&_.np-ring]:!size-4 [&_h1]:text-base [&_h1]:leading-tight" data-mobile-feed-heading tabIndex={-1}><SectionTitle as="h1" accentSlug={feed.category.slug}>{feed.category.name}</SectionTitle></div>
    </div></Block>
    {feed.anchored ? <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted"><span>Разглеждате по-ранни публикации</span><CategoryArchivePageLink href={feed.category.path} prefetch={false} className="font-bold text-accent hover:underline">Към най-новите</CategoryArchivePageLink></div> : null}
    <div id={preview ? undefined : "np-rubric-cards"} className="scroll-mt-[var(--np-header-h)] flex flex-col gap-4">
      {articles.map((article, index) => anchor(article.id, index === 0 ? <MobileLeadCard article={article} priority={!preview && !window} now={now} /> : index < 3 ? <MobileSupportingCard article={article} now={now} /> : <MobileHorizonCard article={article} now={now} />, window))}
      {!articles.length ? <Block id="empty" {...(window ? { window } : {})}><p className="np-card p-6 text-body">{feed.anchored ? "На тази страница вече няма достъпни публикации. Върнете се към най-новите новини в рубриката." : "Все още няма публикувани статии в тази рубрика."}</p></Block> : null}
    </div>
    {feed.previous || feed.next ? (
      <div data-mobile-pager-ignore>
        <CategoryArchiveNav
          categoryName={feed.category.name}
          strip={feed.pageStrip}
          currentPage={feed.pagination.currentPage}
          totalPages={feed.pagination.totalPages}
          firstHref={feed.pagination.firstHref}
          lastHref={feed.pagination.lastPageHref}
          previous={feed.previous}
          next={feed.next}
        />
      </div>
    ) : null}
  </div>;
}
export function MobileFeed({ model, preview = false, namespace, window }: { model: Feed; preview?: boolean; namespace?: string; window?: PreviewWindow }) {
  return model.feed.kind === "home" ? <MobileHomeFeed feed={model.feed} preview={preview} now={new Date(model.asOfMs)} {...(namespace ? { namespace } : {})} {...(window ? { window } : {})} /> : <MobileCategoryFeed feed={model.feed} preview={preview} now={new Date(model.asOfMs)} {...(window ? { window } : {})} />;
}
/** Public props, not a DOM snapshot or an internal RSC payload. The mobile-only controller reads this mounted sentinel. */
export function MobileCanonicalFeed({ model, ssrDesktop = false }: { model: Feed; ssrDesktop?: boolean }) {
  const json = JSON.stringify(model).replace(/</g, "\\u003c");
  // Exclusive mobile SSR must not use lg:hidden — that would blank the page on wide viewports.
  return (
    <MobileFeedBoundary ssrDesktop={ssrDesktop}>
      <div
        className={ssrDesktop ? "lg:hidden" : undefined}
        data-mobile-rubric-canonical={model.canonicalPath}
        data-content-version={model.contentVersion}
        data-menu-version={model.menuVersion}
        data-fresh-until={model.freshUntil}
      >
        <MobileFeed model={model} />
        <script type="application/json" data-mobile-rubric-model dangerouslySetInnerHTML={{ __html: json }} />
      </div>
    </MobileFeedBoundary>
  );
}
