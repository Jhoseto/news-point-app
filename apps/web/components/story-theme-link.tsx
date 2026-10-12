import Link from "next/link";
import type { StoryThemeRefPublic } from "@/lib/queries";
import { themeChronologyNeighbours } from "@/lib/story-route";
import { BookIcon } from "./icons";
import type { StoryThemeArticle } from "@/lib/queries";
import "./story-theme-premium.css";

/** Small banner shown above the article body when the article is part of
 *  one or more story themes. Mobile-first; the desktop rail already shows
 *  the full roadmap so this link is a complement for narrow viewports. */
export function StoryThemeLink({ themes, articles = [], currentArticleId }: { themes: StoryThemeRefPublic[]; articles?: StoryThemeArticle[]; currentArticleId?: string }) {
  if (themes.length === 0) return null;
  const neighbours = currentArticleId ? themeChronologyNeighbours(articles, currentArticleId) : null;
  return (
    <aside className="np-story-mobile-context np-card flex flex-col gap-2 p-3 sm:p-4" aria-label="Свързани теми">
      <span className="np-story-mobile-context-kicker text-xs font-bold tracking-wide text-muted uppercase">
        <BookIcon width={16} height={16} /> Тема с продължение
      </span>
      <ul className="flex flex-col gap-2">
        {themes.map((theme) => (
          <li key={theme.id}>
            <Link
              href={`/temi/${theme.slug}/`}
              className="np-story-mobile-context-link group flex flex-col gap-0.5 rounded-lg px-2 py-1.5 transition hover:bg-surface-2 sm:flex-row sm:items-baseline sm:gap-2"
            >
              <span className="text-sm font-extrabold text-ink group-hover:text-accent">
                {theme.title}
              </span>
              <span className="np-story-mobile-context-position text-xs text-faint">
                Цялата хронология <span aria-hidden="true">↗</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {neighbours && neighbours.index >= 0 ? <>
        <div className="np-story-mobile-position"><span>Новина {neighbours.index + 1} от {articles.length}</span><progress value={neighbours.index + 1} max={articles.length} aria-label="Позиция в темата" /></div>
        {neighbours.previous || neighbours.next ? <nav className="np-story-mobile-neighbours" aria-label="Още от тази история">
          {neighbours.previous ? <Link href={neighbours.previous.path} prefetch={false}><small>← Предишна</small><span>{neighbours.previous.title}</span></Link> : null}
          {neighbours.next ? <Link href={neighbours.next.path} prefetch={false}><small>Следваща →</small><span>{neighbours.next.title}</span></Link> : null}
        </nav> : null}
      </> : null}
    </aside>
  );
}
