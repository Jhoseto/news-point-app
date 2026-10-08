import Link from "next/link";
import { Fragment } from "react";
import { MobileFeedBoundary } from "./mobile-feed-boundary";
import type { MobileRubricFeed as Feed, MobileFeedContent } from "@/lib/mobile-rubric-feed";
import { reviveFeedArticle } from "@/lib/mobile-rubric-feed";
import { MobileCompactRow, MobileHorizonCard, MobileLeadCard, MobileSmallPair, MobileSupportingCard } from "./mobile-home-cards";
import { LeadingCarousel } from "./leading-carousel";
import { HomePoll } from "./home-poll";
import { CompactList } from "./lists";
import { HomeCategorySection } from "./home-category-section";
import { SectionTitle } from "./ui";
import { Breadcrumbs } from "./breadcrumbs";
import { Logo } from "./logo";
import { ArrowRightIcon } from "./icons";

export type PreviewWindow = Record<string, { top: number; left: number; width: number; carousel?: { index: number; offset: number } }>;
function Block({ id, window, children }: { id: string; window?: PreviewWindow; children: React.ReactNode }) {
  const box = window?.[id];
  if (window && !box) return null;
  return <div className={window ? undefined : "contents"} data-mobile-preview-block={id} {...(box ? { style: { position: "absolute" as const, top: box.top, left: box.left, width: box.width } } : {})}>{children}</div>;
}
const anchor = (id: string, child: React.ReactNode, window?: PreviewWindow) => <Block key={id} id={id} {...(window ? { window } : {})}><div className="contents" data-mobile-feed-anchor={id}>{child}</div></Block>;
export function MobileHomeFeed({ feed, preview = false, namespace = "mobile-home", window, now = new Date() }: { feed: Extract<MobileFeedContent, { kind: "home" }>; preview?: boolean; namespace?: string; window?: PreviewWindow; now?: Date }) {
  const hero = feed.hero ? reviveFeedArticle(feed.hero) : null;
  const support = feed.support.map(reviveFeedArticle);
  const carousel = (articles: typeof feed.focusCarousel, props: { title?: string; href?: string; accentSlug?: string; motion?: "to-right" }, id: string) => {
    const position = window?.[id]?.carousel;
    const rotated = position ? [...articles.slice(position.index), ...articles.slice(0, position.index)] : articles;
    return articles.length ? <Block id={id} {...(window ? { window } : {})}><div data-mobile-pager-ignore data-mobile-feed-anchor={id}><LeadingCarousel articles={(preview ? rotated.slice(0, 4) : articles).map(reviveFeedArticle)} mobileOnly preview={preview} previewOffset={position?.offset ?? 0} headingId={`${namespace}-${id}`} {...props} /></div></Block> : null;
  };
  return <div className={`np-container flex flex-col gap-10 pt-6 pb-10${window ? " relative" : ""}`}>
    <h1 tabIndex={-1} data-mobile-feed-heading className="sr-only">NewsPoint.bg – новини</h1>
    <div className="flex flex-col gap-5">
      {hero ? anchor(hero.id, <MobileLeadCard article={hero} priority={!preview && !window} now={now} />, window) : null}
      {support[0] ? anchor(support[0].id, <MobileSupportingCard article={support[0]} now={now} />, window) : null}
      {support[1] && support[2] ? anchor(support[1].id, <MobileSmallPair left={support[1]} right={support[2]} now={now} />, window) : null}
      {support.length > 3 ? <Block id="support-rows" {...(window ? { window } : {})}><div className="np-card flex flex-col divide-y divide-line overflow-hidden">{support.slice(3).map(article => anchor(article.id, <MobileCompactRow article={article} now={now} />))}</div></Block> : null}
      {!hero && !support.length ? <Block id="empty" {...(window ? { window } : {})}><p className="np-card p-6 text-body">Все още няма публикувани новини.</p></Block> : null}
    </div>
    {feed.focusCarousel.length ? <div className="-mt-6">{carousel(feed.focusCarousel, { href: "/na-fokus/", accentSlug: "na-fokus" }, "focus")}</div> : null}
    {carousel(feed.topicsCarousel, { title: "Топ теми", motion: "to-right" }, "topics")}
    {feed.main.map(section => {
      if (section.category.slug !== "balgariya" && (!section.wide || section.category.slug === "glasat-na-istinata")) return null;
      return <Fragment key={section.category.id}>
        {section.category.slug === "balgariya" && feed.poll ? <Block id="poll" {...(window ? { window } : {})}><div data-mobile-pager-ignore data-mobile-feed-anchor="poll"><HomePoll initial={feed.poll} mobileOnly preview={preview} namespace={namespace} /></div></Block> : null}
        <Block id={`section-${section.category.id}`} {...(window ? { window } : {})}><div data-mobile-feed-anchor={`section-${section.category.id}`}><HomeCategorySection category={section.category} articles={section.articles.map(reviveFeedArticle)} layout={section.category.slug === "balgariya" ? "grid" : section.layout === "feature" ? "feature" : "grid"} wide={section.category.slug !== "balgariya"} idPrefix={`${namespace}-`} /></div></Block>
      </Fragment>;
    })}
    {feed.aside.length ? <aside className="flex flex-col gap-6" aria-label="Още новини">{feed.aside.map(section => <Block key={section.category.id} id={`section-${section.category.id}`} {...(window ? { window } : {})}><div data-mobile-feed-anchor={`section-${section.category.id}`}><CompactList title={section.category.name} accentSlug={section.category.slug} href={section.category.path} articles={section.articles.map(reviveFeedArticle)} /></div></Block>)}</aside> : null}
    {carousel(feed.voiceCarousel, { title: "Гласът на истината" }, "voice")}
    <Block id="brand" {...(window ? { window } : {})}><section aria-label="NewsPoint.bg" className="relative isolate overflow-hidden rounded-3xl border border-line bg-surface px-6 py-8 shadow-card sm:px-10">
      <div className="absolute -top-24 -right-16 -z-10 size-72 rounded-full opacity-25 blur-3xl np-gradient-bg dark:opacity-40" aria-hidden="true" />
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between"><Logo className="h-12 sm:h-14" /><p className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Защото истината <span className="np-gradient-text">има значение.</span></p></div>
    </section></Block>
  </div>;
}
export function MobileCategoryFeed({ feed, preview = false, window, now = new Date() }: { feed: Extract<MobileFeedContent, { kind: "category" }>; preview?: boolean; window?: PreviewWindow; now?: Date }) {
  const articles = feed.articles.map(reviveFeedArticle);
  return <div data-np-category-archive className={`np-container flex flex-col gap-4 pt-3 pb-10${window ? " relative" : ""}`}>
    <Block id="category-heading" {...(window ? { window } : {})}><div className="flex flex-col gap-1.5">
      <Breadcrumbs items={[]} dense />
      <div className="[&_.np-section-heading]:mb-0 [&_.np-ring]:!size-4 [&_h1]:text-base [&_h1]:leading-tight" data-mobile-feed-heading tabIndex={-1}><SectionTitle as="h1" accentSlug={feed.category.slug}>{feed.category.name}</SectionTitle></div>
    </div></Block>
    {feed.anchored ? <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted"><span>Разглеждате по-ранни публикации</span><Link href={feed.category.path} prefetch={false} className="font-bold text-accent hover:underline">Към най-новите</Link></div> : null}
    <div className="flex flex-col gap-4">
      {articles.map((article, index) => anchor(article.id, index === 0 ? <MobileLeadCard article={article} priority={!preview && !window} now={now} /> : index < 3 ? <MobileSupportingCard article={article} now={now} /> : <MobileHorizonCard article={article} now={now} />, window))}
      {!articles.length ? <Block id="empty" {...(window ? { window } : {})}><p className="np-card p-6 text-body">{feed.anchored ? "На тази страница вече няма достъпни публикации. Върнете се към най-новите новини в рубриката." : "Все още няма публикувани статии в тази рубрика."}</p></Block> : null}
    </div>
    {feed.previous || feed.next ? <nav aria-label={`Страници на рубрика ${feed.category.name}`} data-mobile-pager-ignore className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
      {feed.previous ? <Link href={feed.previous} prefetch={false} rel="prev" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold text-ink"><ArrowRightIcon className="rotate-180" /> Назад</Link> : <span />}
      {feed.next ? <Link href={feed.next} prefetch={false} rel="next" className="np-gradient-bg inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-on-accent shadow-card">Още новини <ArrowRightIcon /></Link> : <span className="text-sm text-muted">Стигнахте края на наличния архив</span>}
    </nav> : null}
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
