import { notFound } from "next/navigation";
import { loadStoryTheme } from "@/lib/story-themes";
import { StoryTimelinePreview } from "@/components/story-theme-preview";

export const metadata = { title: "Преглед на тема" };
export const dynamic = "force-dynamic";

export default async function PreviewStoryThemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const theme = await loadStoryTheme(id);
  if (!theme) notFound();
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-sm font-bold tracking-wide text-muted uppercase">Преглед</h1>
        <p className="text-xs text-faint">Външен читател ще вижда следното. Страницата е кеширана 60 секунди.</p>
      </header>
      <StoryTimelinePreview theme={theme} />
    </div>
  );
}
