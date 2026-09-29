import Link from "next/link";
import { formatFull, isoDate } from "@/lib/format";
import type { ArticleSummary } from "@/lib/queries";
import { ArticleImage } from "./ui";

function NeighbourCard({ article, direction }: { article: ArticleSummary; direction: "previous" | "next" }) {
  const previous = direction === "previous";
  return (
    <Link href={article.path} rel={previous ? "prev" : "next"} className={`np-article-neighbour is-${direction}`}>
      {article.hero ? <ArticleImage media={article.hero} sizes="(min-width: 640px) 112px, 96px" className="np-article-neighbour-image" /> : <span className="np-article-neighbour-image np-article-neighbour-placeholder" aria-hidden="true" />}
      <span className="np-article-neighbour-copy">
        <span className="np-article-neighbour-direction"><span aria-hidden="true">{previous ? "←" : "→"}</span>{previous ? "Предишна новина" : "Следваща новина"}</span>
        <strong>{article.title}</strong>
        <span className="np-article-neighbour-meta">
          {article.category?.name ? <span>{article.category.name}</span> : null}
          <time dateTime={isoDate(article.publishedAt)}>{formatFull(article.publishedAt)}</time>
        </span>
      </span>
    </Link>
  );
}

export function ArticleNeighbours({ older, newer }: { older: ArticleSummary | null; newer: ArticleSummary | null }) {
  if (!older && !newer) return null;
  return (
    <nav className="np-article-neighbours" aria-label="Предишна и следваща новина">
      {older ? <NeighbourCard article={older} direction="previous" /> : <span />}
      {newer ? <NeighbourCard article={newer} direction="next" /> : null}
    </nav>
  );
}
