import { formatClock } from "@/lib/format";
import type { StoryThemeDetail } from "@/lib/story-theme-types";

function mediaSrc(url: string): string {
  if (!url.startsWith("/media/")) return url;
  return `${(process.env.WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "")}${url}`;
}

/** Studio-only render of the public theme timeline. Server component. */
export function StoryTimelinePreview({ theme }: { theme: StoryThemeDetail }) {
  return (
    <article className="np-card overflow-hidden">
      {theme.coverUrl ? (
        <div className="aspect-[16/9] w-full overflow-hidden bg-surface-2">
          <img src={mediaSrc(theme.coverUrl)} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <header className="flex flex-col gap-3 border-b border-line p-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">{theme.title}</h1>
        {theme.summary ? <p className="text-sm text-muted">{theme.summary}</p> : null}
        {theme.intro ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-body">{theme.intro}</p>
        ) : null}
      </header>
      {theme.articles.length ? (
        <ol className="relative flex flex-col">
          {theme.articles.map((article, index) => (
            <li
              key={article.articleId}
              className="relative flex gap-4 border-b border-line/60 p-5 last:border-b-0"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent tabular-nums">
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 gap-3">
                {article.heroUrl ? (
                  <img src={mediaSrc(article.heroUrl)} alt="" className="size-16 shrink-0 rounded-md object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <h2 className="line-clamp-2 text-base font-bold text-ink">{article.title}</h2>
                  <div className="mt-1 text-xs text-muted">
                    {article.categoryName ? `${article.categoryName} · ` : ""}
                    {formatClock(article.publishedAt ?? new Date())}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="p-6 text-sm text-muted">Все още няма добавени статии.</p>
      )}
    </article>
  );
}
