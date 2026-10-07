import Link from "next/link";
import { formatArticleMeta, formatFull, formatTime, isoDate } from "@/lib/format";
import { articleCountLabel, asDate } from "@/lib/story-route";
import type { StoryThemeArticle, StoryThemeDetailPublic } from "@/lib/queries";
import { ArticleHeroZoom } from "./article-hero-zoom";
import { Breadcrumbs } from "./breadcrumbs";
import { BookIcon, ClockIcon } from "./icons";
import { ShareButtons } from "./share";
import { StoryRouteObserver } from "./story-route-observer";
import { ArticleImage, CategoryPill } from "./ui";
import "./article-premium.css";
import "./story-theme-premium.css";

const THEME_RUBRIC = { id: "temi", slug: "temi", name: "Тема", path: "/temi/" };

const STOP_DATE = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  day: "numeric",
  month: "short",
});

const STOP_WEEKDAY = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", weekday: "long" });
const STOP_DAY_NUM = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "numeric" });
const STOP_MONTH_YEAR = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", month: "long", year: "numeric" });

function stopDate(value: Date | null) {
  return value ? STOP_DATE.format(value) : null;
}

function titled(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function datedArticles(articles: StoryThemeArticle[]) {
  return articles.map((article) => asDate(article.publishedAt)).filter((value): value is Date => Boolean(value));
}

export function StoryTimeline({ theme }: { theme: StoryThemeDetailPublic }) {
  const dates = datedArticles(theme.articles);
  const themePublished = asDate(theme.publishedAt);
  const first = dates[0] ?? themePublished;
  const last = dates[dates.length - 1] ?? themePublished;
  const cover = theme.coverUrl
    ? {
        url: theme.coverUrl,
        alt: theme.title,
        width: null,
        height: null,
        caption: theme.coverCaption,
        credit: "",
      }
    : null;

  return (
    <div className="np-container np-article-page np-story-theme-page">
      <div className="np-article-breadcrumb">
        <Breadcrumbs
          items={[
            { name: "Теми с продължение", path: "/temi/" },
            { name: theme.title },
          ]}
        />
      </div>

      <article>
      <StoryRouteObserver className="np-article-story" count={theme.articles.length}>
        <div className="np-article-main">
          {cover ? <ArticleHeroZoom hero={cover} category={THEME_RUBRIC} lightboxImages={[{ src: cover.url, alt: cover.alt, caption: cover.caption, credit: cover.credit }]} /> : null}

          <header className="np-article-header">
            {!cover ? <CategoryPill category={THEME_RUBRIC} glass={false} className="np-article-no-hero-category" /> : null}
            <div className="np-article-heading-accent" aria-hidden="true" />
            <h1>{theme.title}</h1>
            {theme.summary ? <p className="np-article-deck">{theme.summary}</p> : null}
            <div className="np-article-meta">
              <div className="np-article-byline">
                <span className="np-article-author-mark"><span className="np-ring" aria-hidden="true" /></span>
                <span><small>Тема</small><strong>с продължение</strong></span>
              </div>
              <div className="np-article-meta-facts">
                <span>
                  <ClockIcon width={16} height={16} />
                  <span>
                    <strong>По пътя</strong>
                    {first ? (
                    <time dateTime={isoDate(first)}>
                      <span className="lg:hidden">{formatArticleMeta(first)}</span>
                      <span className="hidden lg:inline">{formatFull(first)}</span>
                    </time>
                    ) : (
                      "—"
                    )}
                  </span>
                </span>
                <span>
                  <BookIcon width={16} height={16} />
                  <span>
                    <strong>Хронология</strong>
                    {articleCountLabel(theme.articles.length)}
                  </span>
                </span>
              </div>
              <ShareButtons url={`/temi/${theme.slug}/`} title={theme.title} />
            </div>
          </header>

          {theme.intro ? <p className="np-story-intro">{theme.intro}</p> : null}

          {theme.articles.length ? (
              <div className="np-story-journey">
                <p className="np-story-journey-kicker">Редакционен маршрут</p>
                <nav className="np-story-map-jump" aria-label="Спирки в темата">
                  {theme.articles.map((article, index) => (
                    <a key={article.articleId} href={`#np-stop-${article.articleId}`} data-story-nav={index}>
                      {stopDate(asDate(article.publishedAt)) ?? index + 1}
                    </a>
                  ))}
                </nav>
                <div className="np-story-route">
                  <span className="np-story-spine" aria-hidden="true">
                    <span className="np-story-spine-fill" />
                  </span>
                  <ol>
                  {theme.articles.map((article, index) => {
                    const publishedAt = asDate(article.publishedAt);
                    const side = index % 2 === 0 ? "west" : "east";
                    return (
                      <li
                        key={article.articleId}
                        id={`np-stop-${article.articleId}`}
                        className={`np-story-stop np-story-stop--${side}`}
                        data-story-stop={index}
                      >
                        <span className="np-story-marker">
                          <span className="np-story-pin">{index + 1}</span>
                        </span>
                        {publishedAt ? (
                          <time className="np-story-when" dateTime={isoDate(publishedAt)}>
                            <span className="np-story-when-weekday">{titled(STOP_WEEKDAY.format(publishedAt))}</span>
                            <span className="np-story-when-day">{STOP_DAY_NUM.format(publishedAt)}</span>
                            <span className="np-story-when-month">{STOP_MONTH_YEAR.format(publishedAt)}</span>
                            <span className="np-story-when-rule" aria-hidden="true" />
                            <span className="np-story-when-time">{formatTime(publishedAt)}</span>
                            <span className="np-story-when-label">публикувана</span>
                          </time>
                        ) : null}
                        <Link href={article.path} className="np-story-card">
                          <div className={`np-story-card-visual${article.heroUrl ? "" : " np-story-card-empty"}`}>
                            {article.heroUrl ? (
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
                            ) : null}
                          </div>
                          <div className="np-story-card-body">
                            <div className="np-story-card-meta">
                              {article.category ? <span>{article.category.name}</span> : null}
                            </div>
                            <h2>{article.title}</h2>
                            <span className="np-story-card-go">Отвори новината</span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                  </ol>
                </div>
              </div>
          ) : null}
        </div>

        {theme.articles.length ? (
          <aside className="np-story-map-rail" aria-label="Карта на темата">
            <p className="np-story-journey-kicker">Карта</p>
            <h2>{theme.title}</h2>
            <p>
              {articleCountLabel(theme.articles.length)}
              {first && last && dates.length > 1 ? ` · ${STOP_DATE.format(first)} — ${STOP_DATE.format(last)}` : null}
            </p>
            <ol>
              {theme.articles.map((article, index) => (
                <li key={article.articleId}>
                  <a href={`#np-stop-${article.articleId}`} data-story-nav={index}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <span>{article.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </aside>
        ) : null}
      </StoryRouteObserver>
      </article>
    </div>
  );
}
