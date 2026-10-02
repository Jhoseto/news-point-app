import { articleSubtitle } from "@newspoint/content";
import { articleSections } from "@/lib/article-reading";
import { formatFull, isoDate, readingMinutes } from "@/lib/format";
import { getArticleNeighbours, getLatest24Hours, getRecommendedArticles, publicAsOfMs, type ArticleDetail } from "@/lib/queries";
import { ArticleBody } from "./article-body";
import { ArticleHeroZoom } from "./article-hero-zoom";
import { ArticleRail } from "./article-rail";
import { ArticleReadCount } from "./article-read-count";
import { ArticleNeighbours } from "./article-neighbours";
import { ArticleTts } from "./article-tts";
import { RelatedStories } from "./related-stories";
import type { LightboxImage } from "./article-lightbox";
import { Breadcrumbs } from "./breadcrumbs";
import { BookIcon, ClockIcon } from "./icons";
import { LatestNews24h } from "./latest-news-24h";
import { CategoryChips } from "./lists";
import { ShareButtons } from "./share";
import { ReadingProgress } from "./reading-progress";
import { CategoryPill } from "./ui";
import "./article-premium.css";

export async function ArticlePage({ article }: { article: ArticleDetail }) {
  const asOfMs = publicAsOfMs();
  const [timeline, latest24h] = await Promise.all([
    getArticleNeighbours(article),
    getLatest24Hours(asOfMs),
  ]);
  const neighbours = [timeline.older[0], timeline.newer[0]].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const related = await getRecommendedArticles(article, 8, neighbours.map(({ id }) => id));
  const sections = articleSections(article.body);
  const subtitle = articleSubtitle(article.excerpt, article.body);
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
      <div className="np-article-breadcrumb"><Breadcrumbs items={crumbs} /></div>

      <article className="np-article-story">
        <div className="np-article-main">
          {article.heroEmbedUrl ? (
            <div className="np-article-hero-embed"><iframe src={article.heroEmbedUrl} title="Вградено hero съдържание" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowFullScreen /></div>
          ) : article.hero ? (
            <ArticleHeroZoom hero={article.hero} category={article.category} lightboxImages={lightboxImages} />
          ) : null}

          <header className="np-article-header">
            {!article.hero && article.category ? <CategoryPill category={article.category} glass={false} className="np-article-no-hero-category" /> : null}
            <div className="np-article-heading-accent" aria-hidden="true" />
            <h1 id="article-tts-title">{article.title}</h1>
            {subtitle ? <p id="article-tts-excerpt" className="np-article-deck">{subtitle}</p> : null}
            <div className="np-article-meta">
              <div className="np-article-byline">
                <span className="np-article-author-mark"><span className="np-ring" aria-hidden="true" /></span>
                <span><small>Автор</small><strong>{article.authorName}</strong></span>
              </div>
              <div className="np-article-meta-facts">
                <span><ClockIcon width={16} height={16} /><span><strong>Публикувано</strong><time dateTime={isoDate(article.publishedAt)}>{formatFull(article.publishedAt)}</time></span></span>
                <span><BookIcon width={16} height={16} /><span><strong>Време за четене</strong>{readingMinutes(article.body)} минути</span></span>
                <ArticleReadCount articleId={article.id} initialCount={article.readCount} />
              </div>
              <ShareButtons url={shareUrl} title={article.title} />
            </div>
          </header>
          {article.listenEnabled ? (
            <ArticleTts
              articleId={article.id}
              title={article.title}
              excerpt={subtitle}
              body={article.body}
              media={article.media}
            />
          ) : null}

          <div className="np-article-reading-layout">
            <div className="np-article-reading-column">
              {sections.length >= 2 ? <div className="np-article-inline-toc"><ArticleRail sections={sections} /></div> : null}
              <div id="np-article-body"><ArticleBody blocks={article.body} media={article.media} /></div>
              <footer className="np-article-end">
                <ArticleNeighbours older={timeline.older[0] ?? null} newer={timeline.newer[0] ?? null} />
                {article.categories.length ? (
                  <div className="np-article-origin">
                    <CategoryChips categories={article.categories} activeId={article.category?.id} title="Рубрики на статията" />
                  </div>
                ) : null}
              </footer>
            </div>
          </div>
        </div>
        {/* Direct sibling of the main column: the shared preview uses its geometry. */}
        <LatestNews24h articles={latest24h} asOfMs={asOfMs} dense className="np-latest-viewport np-article-latest" />
      </article>

      <RelatedStories articles={related} />
    </div>
  );
}
