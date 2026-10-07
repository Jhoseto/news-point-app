import Link from "next/link";
import type { CSSProperties } from "react";
import { formatTime, isoDate } from "@/lib/format";
import { articleCountLabel, asDate } from "@/lib/story-route";
import type { StoryThemeArticle, StoryThemeSummary } from "@/lib/queries";
import { ArticleImage } from "./ui";
import { StoryRoadmapScroll } from "./story-roadmap-scroll";
import "./story-theme-premium.css";

const STOP_DATE = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  day: "numeric",
  month: "short",
});

/**
 * Compact chronological tree in the article right rail — the same route as
 * the public theme page, sized for the news desk column.
 */
export function StoryRoadmap({
  theme,
  articles,
  currentArticleId,
}: {
  theme: StoryThemeSummary;
  articles: StoryThemeArticle[];
  currentArticleId: string;
}) {
  const currentIndex = Math.max(0, articles.findIndex((article) => article.articleId === currentArticleId));
  const progress = articles.length < 2 ? 100 : (currentIndex / (articles.length - 1)) * 100;

  return (
    <aside
      className="np-story-article-rail np-article-latest np-latest-viewport"
      aria-label={`Хронология: ${theme.title}`}
      style={{ "--np-route-progress": `${progress}%` } as CSSProperties}
    >
      <header className="np-story-rail-head">
        <p className="np-story-journey-kicker">Тема с продължение</p>
        <h2>
          <Link href={`/temi/${theme.slug}/`}>{theme.title}</Link>
        </h2>
        <p>{articleCountLabel(articles.length)}</p>
      </header>
      <StoryRoadmapScroll>
        <div className="np-story-rail-route">
          <span className="np-story-spine" aria-hidden="true">
            <span className="np-story-spine-fill" />
          </span>
          <ol>
            {articles.map((article, index) => {
              const publishedAt = asDate(article.publishedAt);
              const current = article.articleId === currentArticleId;
              return (
                <li key={article.articleId} data-current={current ? "" : undefined}>
                  <span className="np-story-rail-pin">{index + 1}</span>
                  {publishedAt ? (
                    <time className="np-story-rail-when" dateTime={isoDate(publishedAt)}>
                      <span className="np-story-rail-time">{formatTime(publishedAt)}</span>
                      <span className="np-story-rail-date">{STOP_DATE.format(publishedAt)}</span>
                    </time>
                  ) : (
                    <span className="np-story-rail-when" />
                  )}
                  {current ? (
                    <span className="np-story-rail-card" aria-current="page">
                      <RailCardBody article={article} />
                    </span>
                  ) : (
                    <Link href={article.path} className="np-story-rail-card">
                      <RailCardBody article={article} />
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </StoryRoadmapScroll>
      <Link href={`/temi/${theme.slug}/`} className="np-story-rail-all">
        Цялата тема
      </Link>
    </aside>
  );
}

function RailCardBody({ article }: { article: StoryThemeArticle }) {
  return (
    <>
      {article.heroUrl ? (
        <span className="np-story-rail-thumb">
          <ArticleImage
            media={{
              url: article.heroUrl,
              alt: "",
              width: null,
              height: null,
              caption: "",
              credit: "",
            }}
            className="h-full w-full object-cover"
          />
        </span>
      ) : (
        <span className="np-story-rail-thumb np-story-rail-thumb-empty" aria-hidden="true" />
      )}
      <span className="np-story-rail-title">{article.title}</span>
    </>
  );
}
