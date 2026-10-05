import Link from "next/link";
import { ArticleImage, TimeMeta } from "./ui";
import type { StoryThemeDetailPublic } from "@/lib/queries";

const TIMELINE_FORMAT = new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "long", year: "numeric" });

function formatDate(value: Date | null) {
  if (!value) return null;
  return TIMELINE_FORMAT.format(value);
}

/** Premium vertical timeline for the public theme page. Server component. */
export function StoryTimeline({ theme }: { theme: StoryThemeDetailPublic }) {
  return (
    <article className="flex flex-col gap-8">
      {theme.coverUrl ? (
        <figure className="overflow-hidden rounded-3xl bg-surface-2 shadow-card">
          <div className="aspect-[16/9] w-full overflow-hidden">
            <ArticleImage
              media={{
                url: theme.coverUrl,
                alt: "",
                width: null,
                height: null,
                caption: theme.coverCaption,
                credit: "",
              }}
              className="h-full w-full object-cover"
            />
          </div>
          {theme.coverCaption ? (
            <figcaption className="px-4 py-2 text-xs text-muted">{theme.coverCaption}</figcaption>
          ) : null}
        </figure>
      ) : null}
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {theme.title}
        </h1>
        {theme.summary ? <p className="text-base text-muted">{theme.summary}</p> : null}
      </header>
      {theme.intro ? (
        <section className="prose prose-base max-w-none whitespace-pre-line text-base leading-relaxed text-body">
          {theme.intro}
        </section>
      ) : null}
      {theme.articles.length ? (
        <section>
          <h2 className="mb-5 text-sm font-bold tracking-wide text-muted uppercase">Хронология</h2>
          <ol className="relative flex flex-col">
            <span
              aria-hidden="true"
              className="absolute top-2 bottom-2 left-[1.125rem] w-px bg-line"
            />
            {theme.articles.map((article, index) => {
              const date = formatDate(article.publishedAt);
              return (
                <li key={article.articleId} className="relative flex gap-4 pb-6 last:pb-0">
                  <span className="z-10 mt-1 flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-sm font-extrabold text-accent tabular-nums">
                    {index + 1}
                  </span>
                  <article className="flex-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:shadow-lg">
                    <Link
                      href={article.path}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-stretch sm:gap-5 sm:p-5"
                    >
                      {article.heroUrl ? (
                        <div className="aspect-[16/9] w-full shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:aspect-square sm:size-32">
                          <ArticleImage
                            media={{
                              url: article.heroUrl,
                              alt: "",
                              width: null,
                              height: null,
                              caption: "",
                              credit: "",
                            }}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {date ? (
                          <time
                            dateTime={article.publishedAt?.toISOString()}
                            className="text-xs font-bold tracking-wide text-muted uppercase"
                          >
                            {date}
                          </time>
                        ) : null}
                        <h3 className="line-clamp-3 text-base font-extrabold leading-snug text-ink sm:text-lg">
                          {article.title}
                        </h3>
                        {article.category ? (
                          <span className="text-xs text-muted">
                            {article.category.name}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </article>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
