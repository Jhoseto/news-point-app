import Link from "next/link";
import type { ArticleSummary, CategoryRef } from "@/lib/queries";
import { CompactCard, TimelineItem } from "./article-card";
import { SectionTitle } from "./ui";

/**
 * `compact` is how many items show on phones and tablets; the rest appear from lg,
 * where the list sits beside the lead story. `fill` lets the list take the height it
 * is given and scroll inside instead of pushing the band taller.
 */
export function LatestList({ articles, id, compact, dense = false, fill = false, className = "" }: { articles: ArticleSummary[]; id?: string; compact?: number; dense?: boolean; fill?: boolean; className?: string }) {
  return (
    <section
      aria-labelledby={id ? `${id}-title` : undefined}
      id={id}
      className={`np-card scroll-mt-32 overflow-hidden ${dense ? "p-4" : "p-5"} ${fill ? "flex min-h-0 flex-col" : ""} ${className}`}
    >
      <SectionTitle id={id ? `${id}-title` : undefined}>Последни новини</SectionTitle>
      <ol
        className={`relative flex flex-col before:absolute before:top-2 before:bottom-2 before:left-[3.25rem] before:w-px before:bg-line ${dense ? "gap-2.5" : "gap-4"} ${fill ? "np-scroll-soft -mr-2 min-h-0 flex-1 overflow-y-auto pr-2" : ""}`}
      >
        {articles.map((article, index) => (
          <TimelineItem key={article.id} article={article} className={compact !== undefined && index >= compact ? "hidden lg:block" : ""} />
        ))}
      </ol>
    </section>
  );
}

export function CompactList({ title, articles, href }: { title: string; articles: ArticleSummary[]; href?: string }) {
  if (!articles.length) return null;
  return (
    <section className="np-card p-5">
      <SectionTitle as="h2" {...(href ? { href } : {})}>
        {title}
      </SectionTitle>
      <div className="flex flex-col gap-4">
        {articles.map((article) => (
          <CompactCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}

export function CategoryChips({ categories, activeId, title }: { categories: CategoryRef[]; activeId?: string | undefined; title?: string }) {
  return (
    <nav aria-label={title ?? "Рубрики"}>
      <ul className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={category.path}
              aria-current={category.id === activeId ? "page" : undefined}
              className="inline-flex rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-body transition hover:border-accent hover:text-accent aria-[current=page]:border-transparent aria-[current=page]:bg-accent aria-[current=page]:text-on-accent dark:hover:text-link"
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
