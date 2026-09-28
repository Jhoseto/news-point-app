import Link from "next/link";
import { articleSections } from "@/lib/article-reading";
import { formatFull, isoDate, readingMinutes } from "@/lib/format";
import { getArticleTimeline, getLatest24Hours, getRelated, type ArticleDetail } from "@/lib/queries";
import { ArticleBody } from "./article-body";
import { ArticleHeroZoom } from "./article-hero-zoom";
import { ArticleRail } from "./article-rail";
import { ArticleTimeline } from "./article-timeline";
import type { LightboxImage } from "./article-lightbox";
import { Breadcrumbs } from "./breadcrumbs";
import { BookIcon, ClockIcon, ExternalIcon } from "./icons";
import { LatestNews24h } from "./latest-news-24h";
import { CategoryChips } from "./lists";
import { ShareButtons } from "./share";
import { ReadingProgress } from "./reading-progress";
import { ArticleImage, CategoryPill } from "./ui";
import "./article-premium.css";

export async function ArticlePage({ article }: { article: ArticleDetail }) {
  const asOfMs = Date.now();
  const [timeline, related, latest24h] = await Promise.all([
    getArticleTimeline(article),
    getRelated(article, 8),
    getLatest24Hours(asOfMs),
  ]);
  const sections = articleSections(article.body);
  const nextStory = timeline.newer[0] ?? timeline.older[0] ?? null;
  const timelineIds = new Set([...timeline.older, article, ...timeline.newer].map((item) => item.id));
  const moreFromRubric = related.filter((item) => !timelineIds.has(item.id)).slice(0, 3);
  const shareUrl = article.sourceUrl ?? article.path;
  const crumbs = article.category
    ? [{ name: article.category.name, path: article.category.path }, { name: article.title }]
    : [{ name: article.title }];

  // Lightbox gallery: hero first, then every body image in document order.
  const lightboxImages: LightboxImage[] = article.hero
    ? [
        { src: article.hero.url, alt: article.hero.alt, caption: article.hero.caption, credit: article.hero.credit },
        ...Array.from(article.media.values()).map((m) => ({
          src: m.url,
          alt: m.alt,
          caption: m.caption,
          credit: m.credit,
        })),
      ].filter((img) => img.src)
    : [];

  return (
    <div className="np-container np-article-page">
      <ReadingProgress />
      <Breadcrumbs items={crumbs} />

      <article className="np-article-story">
        {article.hero ? (
          <div className="np-article-top">
            <ArticleHeroZoom hero={article.hero} category={article.category} lightboxImages={lightboxImages} />
            {/* Direct sibling of the hero: the panel's hover preview anchors to previousElementSibling. */}
            <LatestNews24h articles={latest24h} asOfMs={asOfMs} dense className="np-article-latest hidden lg:flex" />
          </div>
        ) : null}

        <header className="np-article-header">
          {!article.hero && article.category ? <CategoryPill category={article.category} glass={false} className="np-article-no-hero-category" /> : null}
          <div className="np-article-heading-accent" aria-hidden="true" />
          <h1>{article.title}</h1>
          {article.excerpt ? <p className="np-article-deck">{article.excerpt}</p> : null}
          <div className="np-article-meta">
            <div className="np-article-meta-facts">
              <span className="np-article-byline"><span className="np-ring" aria-hidden="true" />{article.authorName}</span>
              <span><ClockIcon width={15} height={15} /><time dateTime={isoDate(article.publishedAt)}>{formatFull(article.publishedAt)}</time></span>
              <span><BookIcon width={15} height={15} />{readingMinutes(article.body)} мин. четене</span>
            </div>
            <ShareButtons url={shareUrl} title={article.title} />
          </div>
        </header>

        <div className={`np-article-reading-layout ${sections.length >= 2 || nextStory ? "has-rail" : ""}`}>
          <div className="np-article-reading-column">
            {sections.length >= 2 ? <div className="np-article-mobile-toc"><ArticleRail sections={sections} /></div> : null}
            <div id="np-article-body"><ArticleBody blocks={article.body} media={article.media} /></div>
            <footer className="np-article-footer">
              {article.categories.length ? (
                <div className="np-article-footer-rubrics">
                  <span>Рубрики</span>
                  <CategoryChips categories={article.categories} activeId={article.category?.id} title="Рубрики на статията" />
                </div>
              ) : null}
              {article.sourceUrl ? (
                <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="np-article-source">
                  Оригинална публикация на newspoint.bg <ExternalIcon width={14} height={14} />
                </a>
              ) : null}
            </footer>
          </div>

          {sections.length >= 2 || nextStory ? (
            <aside className="np-article-side" aria-label="Ориентация в статията">
              <div className="np-article-side-sticky">
                <ArticleRail sections={sections} />
                {nextStory ? (
                  <Link href={nextStory.path} className="np-article-next-story">
                    <span className="np-article-rail-kicker">След четенето</span>
                    <span className="np-article-rail-title">Още в {article.category?.name}</span>
                    <span className="np-article-next-title">{nextStory.title}</span>
                    <span className="np-article-next-action">Към статията <span aria-hidden="true">↗</span></span>
                  </Link>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      </article>

      <ArticleTimeline current={article} older={timeline.older} newer={timeline.newer} />

      {moreFromRubric.length ? (
        <section className="np-article-more" aria-labelledby="np-article-more-title">
          <div className="np-article-more-heading">
            <div>
              <p className="np-article-rail-kicker">Продължете с NewsPoint</p>
              <h2 id="np-article-more-title">Още от {article.category?.name}</h2>
            </div>
            {article.category ? <Link href={article.category.path}>Всички в рубриката <span aria-hidden="true">↗</span></Link> : null}
          </div>
          <div className="np-article-more-grid">
            {moreFromRubric.map((item) => (
              <Link key={item.id} href={item.path} className="np-article-more-card">
                {item.hero ? <ArticleImage media={item.hero} sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 100vw" className="np-article-more-image" /> : null}
                <span className="np-article-more-card-content">
                  <time dateTime={isoDate(item.publishedAt)}>{formatFull(item.publishedAt)}</time>
                  <strong>{item.title}</strong>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
