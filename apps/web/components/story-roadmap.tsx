"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { StoryRoadmapItem } from "./story-roadmap-item";
import type { StoryThemeArticle, StoryThemeSummary } from "@/lib/queries";

const TIMELINE_FORMAT = new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "short" });

function formatDate(value: Date | null) {
  if (!value) return "—";
  return TIMELINE_FORMAT.format(value);
}

/**
 * Compact roadmap shown in the desktop right rail when reading an article
 * that belongs to a story theme. Click switches to the other article via
 * router.push (no full page reload) and the next page mount updates the
 * active marker.
 */
export function StoryRoadmap({
  theme,
  articles,
  currentPosition,
}: {
  theme: StoryThemeSummary;
  articles: StoryThemeArticle[];
  currentPosition: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const onSelect = (path: string) => {
    if (path === pathname) return;
    startTransition(() => router.push(path));
  };

  return (
    <aside className="np-card flex flex-col gap-3 p-4" aria-label={`Хронология: ${theme.title}`}>
      <header className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-wide text-muted uppercase">Тема</span>
        <h2 className="text-sm font-extrabold text-ink">{theme.title}</h2>
        <Link
          href={`/temi/${theme.slug}/`}
          className="text-xs font-bold text-accent hover:underline"
        >
          Цялата история →
        </Link>
      </header>
      <ol className="relative flex flex-col gap-1" aria-label="Хронологичен списък">
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 left-[0.4375rem] w-px bg-line"
        />
        {articles.map((article) => (
          <StoryRoadmapItem
            key={article.articleId}
            article={article}
            isCurrent={article.position === currentPosition}
            isPending={pending}
            onSelect={onSelect}
            formatDate={formatDate}
          />
        ))}
      </ol>
    </aside>
  );
}
