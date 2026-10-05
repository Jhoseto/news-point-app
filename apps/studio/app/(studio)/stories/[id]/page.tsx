import { notFound } from "next/navigation";
import { listRecentMedia, type MediaOption } from "@/lib/articles";
import { loadStoryTheme } from "@/lib/story-themes";
import { StoryThemeEditor } from "@/components/story-theme-editor";

export const metadata = { title: "Редакция на тема" };
export const dynamic = "force-dynamic";

export default async function EditStoryThemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const theme = await loadStoryTheme(id);
  if (!theme) notFound();
  const mediaOptions: MediaOption[] = await listRecentMedia(48, theme.coverMediaId);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{theme.title}</h1>
          <p className="mt-1 text-sm text-muted">
            /{theme.slug} · {theme.articles.length} {theme.articles.length === 1 ? "статия" : "статии"}
          </p>
        </div>
        {theme.isPublished ? (
          <a
            href={`/temi/${theme.slug}/`}
            className="np-btn np-btn-secondary"
            target="_blank"
            rel="noreferrer"
          >
            Виж публичната страница
          </a>
        ) : null}
      </header>
      <StoryThemeEditor mode="edit" theme={theme} mediaOptions={mediaOptions} />
    </div>
  );
}
