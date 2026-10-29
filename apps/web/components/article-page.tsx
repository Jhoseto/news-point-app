import { articleSubtitle } from "@newspoint/content";
import { articleSections } from "@/lib/article-reading";
import { embedProviderFromUrl } from "@/lib/article-embed-url";
import { formatArticleMeta, formatFull, isoDate, readingMinutes } from "@/lib/format";
import {
  getArticleNeighbours,
  getLatest24Hours,
  getRecommendedArticles,
  publicAsOfMs,
  type ArticleDetail,
  type ArticleSummary,
  type StoryThemeRefPublic,
  type StoryThemeSummary,
  type StoryThemeArticle,
} from "@/lib/queries";
import { asDate, themeChronologyNeighbours } from "@/lib/story-route";
import { shareOrigin } from "@/lib/share-card";
import { ArticleBody } from "./article-body";
import { ArticleAnalytics } from "./article-analytics";
import { publicAnalyticsEnabled, readPublicAnalyticsConfig } from "@/lib/public-analytics";
import { ArticleEmbedFrame } from "./article-embed-frame";
import { ArticleHeroZoom } from "./article-hero-zoom";
import { ArticleRail } from "./article-rail";
import { ArticleReadCount } from "./article-read-count";
import { ArticleNeighbours } from "./article-neighbours";
import { ArticleTts } from "./article-tts";
import { RelatedStories } from "./related-stories";
import { StoryRoadmap } from "./story-roadmap";
import { StoryThemeLink } from "./story-theme-link";
import { articleImageGallery } from "@/lib/article-image-gallery";
import { storyThemeImage } from "@/lib/story-theme-image";
import { Breadcrumbs } from "./breadcrumbs";
import { BookIcon, ClockIcon } from "./icons";
import { LatestNews24h } from "./latest-news-24h";
import { CategoryChips } from "./lists";
import { ShareButtons } from "./share";
import { ReadingProgress } from "./reading-progress";
import { CategoryPill } from "./ui";
import "./article-premium.css";

function themeStopToSummary(stop: StoryThemeArticle): ArticleSummary {
  return {
    id: stop.articleId,
    path: stop.path,
    title: stop.title,
    excerpt: "",
    authorName: "",
    publishedAt: asDate(stop.publishedAt) ?? new Date(Number.NaN),
    category: stop.category,
    hero: storyThemeImage(stop),
  };
}

export async function ArticlePage({
  article,
  storyThemes = [],
  storyThemeCompact = null,
}: {
  article: ArticleDetail;
  storyThemes?: StoryThemeRefPublic[];
  storyThemeCompact?: { theme: StoryThemeSummary; articles: StoryThemeArticle[]; currentPosition: number } | null;
}) {
  const compact = storyThemeCompact;
  const asOfMs = publicAsOfMs();
  const themeStops = compact ? themeChronologyNeighbours(compact.articles, article.id) : null;
  const [timeline, latest24h] = await Promise.all([
    compact ? Promise.resolve({ older: [] as ArticleSummary[], newer: [] as ArticleSummary[] }) : getArticleNeighbours(article),
    compact ? Promise.resolve([] as ArticleSummary[]) : getLatest24Hours(asOfMs),
  ]);
  const older = themeStops ? (themeStops.previous ? themeStopToSummary(themeStops.previous) : null) : (timeline.older[0] ?? null);
  const newer = themeStops ? (themeStops.next ? themeStopToSummary(themeStops.next) : null) : (timeline.newer[0] ?? null);
  const neighbours = [older, newer].filter((item): item is ArticleSummary => Boolean(item));
  const related = await getRecommendedArticles(article, 10, neighbours.map(({ id }) => id));
  const sections = articleSections(article.body);
  const subtitle = articleSubtitle(article.excerpt, article.body);
  const shareUrl = `${shareOrigin()}${article.path}`;
  const crumbs = article.category
    ? [{ name: article.category.name, path: article.category.path }, { name: article.title }]
    : [{ name: article.title }];

  // Lightbox gallery: hero first, then every body image in document order.
  const imageGallery = articleImageGallery(article.body, article.media, article.heroEmbedUrl ? null : article.hero);
  const analytics = publicAnalyticsEnabled() ? readPublicAnalyticsConfig() : null;
  const authorAvatarUrl = article.authorKind === "staff" && article.authorUserId
    ? `/api/authors/${encodeURIComponent(article.authorUserId)}/avatar/`
    : null;

  return (
    <div className="np-container np-article-page">
      {analytics?.kind === "ga4" ? <ArticleAnalytics key={article.id} path={article.path} measurementId={analytics.measurementId}
        meta={{ article_id: article.id, article_category: (article.category?.name ?? "Без рубрика").slice(0, 100),
          article_author: article.authorName.slice(0, 100),
          content_kind: article.heroEmbedUrl || article.body.some(block => block.type === "embed") ? "article_with_embed" : "article" }}
        targets={[...neighbours, ...related, ...latest24h].map(({ path, id }) => ({ path, id }))} /> : null}
      <ReadingProgress />
      <div className="np-article-breadcrumb"><Breadcrumbs items={crumbs} /></div>

      <article data-np-latest-frame className="np-article-story">
        <div data-np-latest-stage className="np-article-main">
          {article.heroEmbedUrl ? (
            <ArticleEmbedFrame src={article.heroEmbedUrl} provider={embedProviderFromUrl(article.heroEmbedUrl)} title="Вградено hero съдържание" className="np-article-hero-embed" />
          ) : article.hero ? (
            <ArticleHeroZoom hero={article.hero} category={article.category} lightboxImages={imageGallery.images} />
          ) : null}

          <header className="np-article-header">
            {!article.hero && article.category ? <CategoryPill category={article.category} glass={false} className="np-article-no-hero-category" /> : null}
            <div className="np-article-heading-accent" aria-hidden="true" />
            <h1 id="article-tts-title">{article.title}</h1>
            {subtitle ? <p id="article-tts-excerpt" className="np-article-deck">{subtitle}</p> : null}
            <div className="np-article-meta">
              <div className="np-article-byline">
                <span
                  className="np-article-author-mark"
                  style={authorAvatarUrl ? { backgroundImage: `url("${authorAvatarUrl}")` } : undefined}
                >
                  {authorAvatarUrl ? null : <span className="np-ring" aria-hidden="true" />}
                </span>
                <span><small>Автор</small><strong>{article.authorName}</strong></span>
              </div>
              <div className="np-article-meta-facts">
                <span><ClockIcon width={16} height={16} /><span><strong>Публикувано</strong><time dateTime={isoDate(article.publishedAt)}><span className="lg:hidden">{formatArticleMeta(article.publishedAt)}</span><span className="hidden lg:inline">{formatFull(article.publishedAt)}</span></time></span></span>
                <span><BookIcon width={16} height={16} /><span><strong>Време за четене</strong>{readingMinutes(article.body)} минути</span></span>
                <ArticleReadCount articleId={article.id} initialCount={article.readCount} />
              </div>
              <ShareButtons url={shareUrl} title={article.title} />
            </div>
          </header>
          {article.listenEnabled ? (
            <ArticleTts
              key={`${article.id}:${article.version}`}
              articleId={article.id}
              version={article.version}
              title={article.title}
              excerpt={subtitle}
              body={article.body}
              media={article.media}
            />
          ) : null}

          {storyThemes.length > 0 ? (
            <div className="xl:hidden">
              <StoryThemeLink themes={storyThemes} articles={compact?.articles ?? []} currentArticleId={article.id} />
            </div>
          ) : null}

          <div className="np-article-reading-layout">
            <div className="np-article-reading-column">
              {sections.length >= 2 ? <div className="np-article-inline-toc"><ArticleRail sections={sections} /></div> : null}
              <div id="np-article-body"><ArticleBody blocks={article.body} media={article.media} imageGallery={imageGallery} /></div>
              <footer className="np-article-end">
                <ArticleNeighbours
                  older={older}
                  newer={newer}
                  previousLabel={compact ? "Предишна в темата" : "Предишна новина"}
                  nextLabel={compact ? "Следваща в темата" : "Следваща новина"}
                />
                {article.categories.length ? (
                  <div className="np-article-origin">
                    <CategoryChips categories={article.categories} activeId={article.category?.id} title="Рубрики на статията" />
                  </div>
                ) : null}
              </footer>
            </div>
          </div>
        </div>
        {compact ? (
          <StoryRoadmap
            theme={compact.theme}
            articles={compact.articles}
            currentArticleId={article.id}
          />
        ) : (
          <LatestNews24h articles={latest24h} asOfMs={asOfMs} dense size="rail" className="np-article-latest" />
        )}
      </article>

      <RelatedStories articles={related} />
    </div>
  );
}
