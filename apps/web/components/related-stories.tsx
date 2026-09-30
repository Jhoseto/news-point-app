import Link from "next/link";
import { isoDate } from "@/lib/format";
import type { ArticleSummary } from "@/lib/queries";
import { ArticleImage } from "./ui";
import { RelatedStoriesControls } from "./related-stories-controls";

const compactDate = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "numeric", month: "short", year: "numeric" });

export function RelatedStories({ articles }: { articles: ArticleSummary[] }) {
  if (!articles.length) return null;
  return (
    <section className="np-related-stories" aria-labelledby="np-related-title">
      <div className="np-related-heading">
        <span className="np-ring" aria-hidden="true" />
        <h2 id="np-related-title">Свързани с тази статия</h2>
      </div>
      <RelatedStoriesControls>
        {articles.map((article, index) => (
          <Link key={article.id} href={article.path} prefetch={false} className="np-related-card">
            <span className="np-related-card-media">
              {article.hero ? <ArticleImage media={article.hero} sizes="(min-width: 1024px) 300px, 76vw" className="np-related-card-image" /> : <span className="np-related-card-placeholder" aria-hidden="true" />}
              <span className="np-related-card-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            </span>
            <span className="np-related-card-content">
              <span className="np-related-card-meta">
                {article.category?.name ? <span>{article.category.name}</span> : null}
                <time dateTime={isoDate(article.publishedAt)}>{compactDate.format(article.publishedAt)}</time>
              </span>
              <strong>{article.title}</strong>
              <span className="np-related-card-action">Прочетете <span aria-hidden="true">↗</span></span>
            </span>
          </Link>
        ))}
      </RelatedStoriesControls>
    </section>
  );
}
