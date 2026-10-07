import Link from "next/link";
import { ArticleImage, TimeMeta } from "./ui";
import { asDate } from "@/lib/story-route";
import type { StoryThemeSummary } from "@/lib/queries";

/** Listing card for the public theme index. Server component. */
export function StoryThemeCard({ theme }: { theme: StoryThemeSummary }) {
  const publishedAt = asDate(theme.publishedAt);
  return (
    <Link
      href={`/temi/${theme.slug}/`}
      className="group block overflow-hidden rounded-3xl border border-line bg-surface shadow-card transition hover:shadow-lg"
    >
      {theme.coverUrl ? (
        <div className="aspect-[16/9] w-full overflow-hidden bg-surface-2">
          <ArticleImage
            media={{
              url: theme.coverUrl,
              alt: "",
              width: null,
              height: null,
              caption: theme.coverCaption,
              credit: "",
            }}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="aspect-[16/9] w-full bg-surface-2" />
      )}
      <div className="flex flex-col gap-2 p-5">
        <h3 className="line-clamp-2 text-lg font-extrabold tracking-tight text-ink">{theme.title}</h3>
        {theme.summary ? (
          <p className="line-clamp-2 text-sm text-muted">{theme.summary}</p>
        ) : null}
        <div className="mt-2 flex items-center justify-between text-xs text-faint">
          <span>
            {theme.articleCount === 1
              ? "1 статия"
              : `${theme.articleCount} статии`}
          </span>
          {publishedAt ? <TimeMeta date={publishedAt} relative /> : null}
        </div>
      </div>
    </Link>
  );
}
