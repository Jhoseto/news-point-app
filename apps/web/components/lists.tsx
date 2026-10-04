import Link from "next/link";
import type { HomeShineAllocator } from "@/lib/home-shine";
import { shineDelayProp } from "@/lib/shine-style";
import type { ArticleSummary, CategoryRef } from "@/lib/queries";
import { CompactCard } from "./article-card";
import { SectionTitle } from "./ui";

export function CompactList({
  title,
  accentSlug,
  articles,
  href,
  shine,
}: {
  title: string;
  accentSlug?: string;
  articles: ArticleSummary[];
  href?: string;
  shine?: HomeShineAllocator;
}) {
  if (!articles.length) return null;
  return (
    <section className="np-card p-5">
      <SectionTitle as="h2" accentSlug={accentSlug} {...(href ? { href } : {})}>
        {title}
      </SectionTitle>
      <div className="flex flex-col gap-4">
        {articles.map((article) => (
          <CompactCard key={article.id} article={article} {...shineDelayProp(shine?.nextCard())} />
        ))}
      </div>
    </section>
  );
}

export function CategoryChips({
  categories,
  activeId,
  title,
  dense = false,
}: {
  categories: CategoryRef[];
  activeId?: string | undefined;
  title?: string;
  dense?: boolean;
}) {
  return (
    <nav aria-label={title ?? "Рубрики"}>
      <ul className={`np-scroll-soft flex flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible ${dense ? "gap-1.5 pb-0" : "gap-2 pb-1 sm:pb-0"}`}>
        {categories.map((category) => (
          <li key={category.id} className="shrink-0">
            <Link
              href={category.path}
              aria-current={category.id === activeId ? "page" : undefined}
              className={`inline-flex items-center rounded-full border border-line bg-surface font-semibold text-body transition hover:border-accent hover:text-accent aria-[current=page]:border-transparent aria-[current=page]:bg-accent aria-[current=page]:text-on-accent dark:hover:text-link ${
                dense ? "min-h-9 px-3 py-1 text-xs" : "min-h-11 px-3.5 py-1.5 text-sm"
              }`}
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
