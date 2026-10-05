import Link from "next/link";
import type { StoryThemeRefPublic } from "@/lib/queries";

/** Small banner shown above the article body when the article is part of
 *  one or more story themes. Mobile-first; the desktop rail already shows
 *  the full roadmap so this link is a complement for narrow viewports. */
export function StoryThemeLink({ themes }: { themes: StoryThemeRefPublic[] }) {
  if (themes.length === 0) return null;
  return (
    <aside className="np-card flex flex-col gap-2 p-3 sm:p-4" aria-label="Свързани теми">
      <span className="text-xs font-bold tracking-wide text-muted uppercase">
        Тази публикация е част от
      </span>
      <ul className="flex flex-col gap-2">
        {themes.map((theme) => (
          <li key={theme.id}>
            <Link
              href={`/temi/${theme.slug}/`}
              className="group flex flex-col gap-0.5 rounded-lg px-2 py-1.5 transition hover:bg-surface-2 sm:flex-row sm:items-baseline sm:gap-2"
            >
              <span className="text-sm font-extrabold text-ink group-hover:text-accent">
                {theme.title}
              </span>
              <span className="text-xs text-faint">
                {theme.position} / {theme.totalArticles} в хронологията
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
