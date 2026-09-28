import Link from "next/link";
import { chronologicalStrip } from "@/lib/article-reading";
import { formatFull, isoDate } from "@/lib/format";
import type { ArticleSummary } from "@/lib/queries";
import { ArticleImage } from "./ui";
import { ArticleTimelineControls } from "./article-timeline-controls";

export function ArticleTimeline({ current, older, newer }: { current: ArticleSummary; older: ArticleSummary[]; newer: ArticleSummary[] }) {
  if (!older.length && !newer.length) return null;
  const items = chronologicalStrip(older, current, newer);
  return (
    <nav className="np-article-timeline" aria-label="Хронология на статиите в рубриката">
      <div className="np-article-timeline-heading">
        <div>
          <p className="np-article-rail-kicker">Преди · сега · след</p>
          <h2>Хронология в {current.category?.name ?? "рубриката"}</h2>
          <p>Публикациите около тази история, подредени по време.</p>
        </div>
      </div>
      <ArticleTimelineControls>
        {items.map(({ article, position }) => {
          const inner = (
            <>
              <span className="np-article-timeline-point" aria-hidden="true" />
              <span className="np-article-timeline-date"><time dateTime={isoDate(article.publishedAt)}>{formatFull(article.publishedAt)}</time></span>
              <span className="np-article-timeline-card">
                {article.hero ? <ArticleImage media={article.hero} sizes="(min-width: 1024px) 250px, 70vw" className="np-article-timeline-image" /> : null}
                <span className="np-article-timeline-card-content">
                  <span className="np-article-timeline-label">{position === "current" ? "Тази статия" : position === "older" ? "По-ранна" : "По-нова"}</span>
                  <span className="np-article-timeline-title">{article.title}</span>
                </span>
              </span>
            </>
          );
          return position === "current" ? (
            <div key={article.id} className="np-article-timeline-item is-current" data-current-story aria-current="page">{inner}</div>
          ) : (
            <Link key={article.id} href={article.path} rel={article.id === older[0]?.id ? "prev" : article.id === newer[0]?.id ? "next" : undefined} className="np-article-timeline-item">{inner}</Link>
          );
        })}
      </ArticleTimelineControls>
    </nav>
  );
}
