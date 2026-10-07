"use client";

import type { StoryThemeArticle } from "@/lib/queries";

type Props = {
  article: StoryThemeArticle;
  isCurrent: boolean;
  isPending: boolean;
  onSelect: (path: string) => void;
  formatDate: (value: Date | string | null) => string;
};

/** One row in the compact story roadmap. Renders as a button so the click
 *  handler can drive the router push without an anchor reload. */
export function StoryRoadmapItem({ article, isCurrent, isPending, onSelect, formatDate }: Props) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className={`absolute top-2.5 left-1 size-2.5 rounded-full border-2 ${
          isCurrent ? "border-accent bg-accent" : "border-line bg-surface"
        }`}
      />
      <button
        type="button"
        onClick={() => onSelect(article.path)}
        disabled={isPending}
        aria-current={isCurrent ? "true" : undefined}
        className={`block w-full rounded-lg px-4 py-2 text-left transition ${
          isCurrent ? "bg-accent/10" : "hover:bg-surface-2"
        } disabled:opacity-70`}
      >
        <span
          className={`block text-xs ${
            isCurrent ? "font-extrabold text-accent" : "text-faint"
          }`}
        >
          {formatDate(article.publishedAt)}
        </span>
        <span
          className={`line-clamp-2 text-sm ${
            isCurrent ? "font-extrabold text-ink" : "text-body"
          }`}
        >
          {article.title}
        </span>
      </button>
    </li>
  );
}
